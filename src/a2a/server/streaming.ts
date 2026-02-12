import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { logger } from '../../shared/logger.js';
import { formatSSE, setSSEHeaders, startHeartbeat } from '../../shared/sse.js';
import { translateA2AMessageToText } from '../../translation/a2a-to-agentforce.js';
import { bridgeAgentforceToA2A } from '../../translation/streaming-bridge.js';
import { streamAgentforceMessages } from '../../agentforce/client/streaming.js';
import { mapErrorToJsonRpc, RPC_INVALID_PARAMS } from '../../translation/error-mapper.js';
import { getEventBus } from '../../dashboard/event-bus.js';
import type { JsonRpcHandlerDeps } from './jsonrpc-handler.js';
import type { SendTaskParams, JsonRpcResponse } from '../types.js';

/**
 * Handle tasks/sendSubscribe — SSE streaming response.
 *
 * Streams A2A events as SSE to the client while forwarding to
 * Agentforce's streaming endpoint. Includes heartbeat to prevent
 * Heroku's 30-second idle timeout.
 */
export async function handleStreamRequest(
  rpcId: string | number,
  params: SendTaskParams,
  deps: JsonRpcHandlerDeps,
  req: Request,
  res: Response,
): Promise<void> {
  // ── Validate ────────────────────────────────────────────────────────────
  if (!params?.message?.parts?.length) {
    res.status(400).json(rpcError(rpcId, RPC_INVALID_PARAMS, 'Missing message.parts'));
    return;
  }

  const taskId = params.id ?? randomUUID();
  const contextId = params.contextId ?? randomUUID();

  logger.info({ taskId, contextId }, 'tasks/sendSubscribe (streaming)');

  // ── Set SSE headers ────────────────────────────────────────────────────
  setSSEHeaders(res);

  // ── Start heartbeat (15s interval) ─────────────────────────────────────
  const stopHeartbeat = startHeartbeat(res);

  // ── Handle client disconnect ───────────────────────────────────────────
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    stopHeartbeat();
    logger.info({ taskId, contextId }, 'SSE client disconnected');
  });

  try {
    // ── Look up or create session ──────────────────────────────────────
    let session = await deps.sessionManager.getByContextId(contextId);

    if (!session) {
      const afSessionId = await deps.agentforceClient.createSession();
      session = await deps.sessionManager.createSession({
        contextId,
        taskId,
        afSessionId,
        afAgentId: '',
        tenantId: deps.tenantId,
      });
    } else {
      await deps.sessionManager.addTask(contextId, taskId);
    }

    // ── Send initial "submitted" status ────────────────────────────────
    const submittedEvent = {
      jsonrpc: '2.0' as const,
      id: rpcId,
      result: {
        id: taskId,
        status: { state: 'submitted', timestamp: new Date().toISOString() },
        final: false,
      },
    };
    if (!clientDisconnected) {
      res.write(formatSSE('status', submittedEvent));
    }

    // ── Translate & stream ─────────────────────────────────────────────
    const text = translateA2AMessageToText(params.message);
    const sequenceId = await deps.sessionManager.nextSequenceId(contextId);

    // Emit streaming request event to dashboard
    const bus = getEventBus();
    bus.emitConversation({
      direction: 'inbound',
      source: 'External A2A Agent',
      target: 'Agentforce',
      taskId,
      contextId,
      messageType: 'request',
      content: text,
      metadata: { streaming: true },
    });

    const startTime = Date.now();

    const token = await deps.agentforceClient.authenticate();

    const agentforceStream = streamAgentforceMessages(
      token.accessToken,
      session.afSessionId,
      sequenceId,
      text,
    );

    const a2aStream = bridgeAgentforceToA2A(agentforceStream, taskId, contextId);

    let lastState = 'working';
    let fullResponse = '';

    for await (const event of a2aStream) {
      if (clientDisconnected) break;

      const ssePayload = {
        jsonrpc: '2.0' as const,
        id: rpcId,
        result: event.data,
      };

      res.write(formatSSE(event.type, ssePayload));

      if (event.type === 'status') {
        lastState = event.data.status.state;
      }

      // Accumulate artifact text for dashboard
      if (event.type === 'artifact' && event.data.artifact?.parts) {
        for (const part of event.data.artifact.parts) {
          if (part.type === 'text' && part.text) {
            fullResponse += part.text;
          }
        }
      }
    }

    // Emit streaming response event to dashboard
    const latencyMs = Date.now() - startTime;
    bus.emitConversation({
      direction: 'inbound',
      source: 'Agentforce',
      target: 'External A2A Agent',
      taskId,
      contextId,
      messageType: 'response',
      content: fullResponse || `[Stream completed: ${lastState}]`,
      latencyMs,
      metadata: { streaming: true, finalState: lastState },
    });

    // ── Cache final state ──────────────────────────────────────────────
    await deps.sessionManager.updateTaskState(
      contextId,
      { state: lastState, timestamp: new Date().toISOString() } as unknown as Record<string, unknown>,
    );
  } catch (err) {
    logger.error({ err, taskId, contextId }, 'Streaming error');

    if (!clientDisconnected) {
      const rpcErr = mapErrorToJsonRpc(err);
      const errorPayload = {
        jsonrpc: '2.0' as const,
        id: rpcId,
        result: {
          id: taskId,
          status: {
            state: 'failed',
            message: { role: 'agent', parts: [{ type: 'text', text: rpcErr.message }] },
            timestamp: new Date().toISOString(),
          },
          final: true,
        },
      };
      res.write(formatSSE('status', errorPayload));
    }
  } finally {
    stopHeartbeat();
    if (!clientDisconnected) {
      res.end();
    }
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function rpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
