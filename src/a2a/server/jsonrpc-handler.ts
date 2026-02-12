import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { logger } from '../../shared/logger.js';
import { NotFoundError } from '../../shared/errors.js';
import { AgentforceClient } from '../../agentforce/client/index.js';
import { SessionManager } from '../../session/session-manager.js';
import { translateA2AMessageToText } from '../../translation/a2a-to-agentforce.js';
import {
  translateAgentforceResponseToTask,
  buildCanceledTask,
  extractTextFromA2ATask,
} from '../../translation/agentforce-to-a2a.js';
import {
  mapErrorToJsonRpc,
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_INVALID_PARAMS,
} from '../../translation/error-mapper.js';
import { handleStreamRequest } from './streaming.js';
import { getEventBus } from '../../dashboard/event-bus.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  SendTaskParams,
  GetTaskParams,
  CancelTaskParams,
  A2ATask,
} from '../types.js';

// ─── Factory ────────────────────────────────────────────────────────────────

export interface JsonRpcHandlerDeps {
  agentforceClient: AgentforceClient;
  sessionManager: SessionManager;
  tenantId: string; // single-tenant MVP
}

export function createJsonRpcHandler(deps: JsonRpcHandlerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;

    // ── 1. Validate JSON-RPC envelope ───────────────────────────────────
    if (!body || typeof body !== 'object') {
      res.json(rpcError(null, RPC_PARSE_ERROR, 'Parse error'));
      return;
    }

    const rpcReq = body as unknown as JsonRpcRequest;

    if (rpcReq.jsonrpc !== '2.0' || !rpcReq.method || rpcReq.id == null) {
      res.json(rpcError(rpcReq.id ?? null, RPC_INVALID_REQUEST, 'Invalid Request'));
      return;
    }

    // ── 2. Dispatch by method ───────────────────────────────────────────
    try {
      let result: A2ATask;

      switch (rpcReq.method) {
        case 'tasks/send':
          result = await handleSendTask(rpcReq.params as unknown as SendTaskParams, deps);
          break;

        case 'tasks/get':
          result = await handleGetTask(rpcReq.params as unknown as GetTaskParams, deps);
          break;

        case 'tasks/cancel':
          result = await handleCancelTask(rpcReq.params as unknown as CancelTaskParams, deps);
          break;

        case 'tasks/sendSubscribe':
          // Streaming — delegates to SSE handler, which manages its own response
          await handleStreamRequest(
            rpcReq.id,
            rpcReq.params as unknown as SendTaskParams,
            deps,
            req,
            res,
          );
          return;

        default:
          res.json(rpcError(rpcReq.id, RPC_METHOD_NOT_FOUND, `Method not found: ${rpcReq.method}`));
          return;
      }

      res.json(rpcSuccess(rpcReq.id, result));
    } catch (err) {
      logger.error({ err, method: rpcReq.method }, 'JSON-RPC handler error');
      const rpcErr = mapErrorToJsonRpc(err);
      res.json(rpcError(rpcReq.id, rpcErr.code, rpcErr.message));
    }
  };
}

// ─── Method handlers ────────────────────────────────────────────────────────

async function handleSendTask(
  params: SendTaskParams,
  deps: JsonRpcHandlerDeps,
): Promise<A2ATask> {
  if (!params?.message?.parts?.length) {
    throw Object.assign(new Error('Missing message.parts'), { rpcCode: RPC_INVALID_PARAMS });
  }

  const taskId = params.id ?? randomUUID();
  const contextId = params.contextId ?? randomUUID();

  logger.info({ taskId, contextId }, 'tasks/send');

  // ── Look up or create session ─────────────────────────────────────────
  let session = await deps.sessionManager.getByContextId(contextId);

  if (!session) {
    // First message in this context — create Agentforce session
    const afSessionId = await deps.agentforceClient.createSession();

    session = await deps.sessionManager.createSession({
      contextId,
      taskId,
      afSessionId,
      afAgentId: '', // populated from client config
      tenantId: deps.tenantId,
    });
  } else {
    // Existing context — register this task
    await deps.sessionManager.addTask(contextId, taskId);
  }

  // ── Translate & send ──────────────────────────────────────────────────
  const text = translateA2AMessageToText(params.message);
  const sequenceId = await deps.sessionManager.nextSequenceId(contextId);

  // Emit inbound request event to dashboard
  const bus = getEventBus();
  bus.emitConversation({
    direction: 'inbound',
    source: 'External A2A Agent',
    target: 'Agentforce',
    taskId,
    contextId,
    messageType: 'request',
    content: text,
  });

  const startTime = Date.now();

  const afResponse = await deps.agentforceClient.sendMessage(
    session.afSessionId,
    sequenceId,
    text,
  );

  const latencyMs = Date.now() - startTime;

  // ── Translate response to A2A Task ────────────────────────────────────
  const task = translateAgentforceResponseToTask(
    afResponse.raw,
    taskId,
    contextId,
  );

  // Emit inbound response event to dashboard
  const responseText = extractTextFromA2ATask(task);
  bus.emitConversation({
    direction: 'inbound',
    source: 'Agentforce',
    target: 'External A2A Agent',
    taskId,
    contextId,
    messageType: 'response',
    content: responseText,
    latencyMs,
  });

  // ── Cache task state ──────────────────────────────────────────────────
  await deps.sessionManager.updateTaskState(
    contextId,
    task.status as unknown as Record<string, unknown>,
    task.artifacts as unknown as Record<string, unknown>[],
  );

  return task;
}

async function handleGetTask(
  params: GetTaskParams,
  deps: JsonRpcHandlerDeps,
): Promise<A2ATask> {
  if (!params?.id) {
    throw Object.assign(new Error('Missing task id'), { rpcCode: RPC_INVALID_PARAMS });
  }

  const session = await deps.sessionManager.getByTaskId(params.id);
  if (!session || !session.lastTaskState) {
    throw new NotFoundError(`Task ${params.id} not found`);
  }

  const task: A2ATask = {
    id: params.id,
    contextId: session.a2aContextId,
    status: session.lastTaskState as unknown as A2ATask['status'],
    artifacts: session.artifacts as unknown as A2ATask['artifacts'],
  };

  return task;
}

async function handleCancelTask(
  params: CancelTaskParams,
  deps: JsonRpcHandlerDeps,
): Promise<A2ATask> {
  if (!params?.id) {
    throw Object.assign(new Error('Missing task id'), { rpcCode: RPC_INVALID_PARAMS });
  }

  const session = await deps.sessionManager.getByTaskId(params.id);
  if (!session) {
    throw new NotFoundError(`Task ${params.id} not found`);
  }

  // Cannot cancel if the session is already closed
  if (session.state !== 'active') {
    throw Object.assign(
      new Error(`Session for task ${params.id} is already ${session.state}`),
      { rpcCode: RPC_INVALID_PARAMS },
    );
  }

  // Delete Agentforce session (best-effort)
  await deps.agentforceClient.deleteSession(session.afSessionId);
  await deps.sessionManager.closeSession(session.a2aContextId, 'completed');

  return buildCanceledTask(params.id, session.a2aContextId);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rpcSuccess(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
