import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { logger } from '../../shared/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import type { A2AClient } from '../../a2a/client/a2a-client.js';
import type { AgentRegistry } from '../../config/agent-registry.js';
import type { SessionManager } from '../../session/session-manager.js';
import {
  createA2AMessageFromText,
  extractTextFromA2ATask,
} from '../../translation/agentforce-to-a2a.js';
import { getEventBus } from '../../dashboard/event-bus.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DelegateHandlerDeps {
  a2aClient: A2AClient;
  agentRegistry: AgentRegistry;
  sessionManager: SessionManager;
  tenantId: string;
}

export interface DelegateRequest {
  agentAlias: string;
  message: string;
  contextId?: string;
}

export interface DelegateResponse {
  taskId: string;
  contextId: string;
  status: string;
  response: string;
  artifacts: Array<{
    name?: string;
    parts: Array<{ type: string; text?: string }>;
    index: number;
  }>;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * Factory that creates the delegate handler.
 *
 * POST /api/v1/delegate
 *
 * Flow:
 *  1. Validate request body
 *  2. Look up external agent by alias
 *  3. Build A2A message from text
 *  4. Send via A2A client
 *  5. Extract text response
 *  6. Store outbound session state for multi-turn
 *  7. Return flat JSON response
 */
export function createDelegateHandler(deps: DelegateHandlerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as DelegateRequest;

      // ── Validate ──────────────────────────────────────────────────────
      if (!body.agentAlias) {
        res.status(400).json({ error: 'Missing required field: agentAlias' });
        return;
      }
      if (!body.message) {
        res.status(400).json({ error: 'Missing required field: message' });
        return;
      }

      // ── Look up agent ────────────────────────────────────────────────
      const agentConfig = deps.agentRegistry.getAgent(body.agentAlias);
      if (!agentConfig) {
        res.status(404).json({ error: `Agent not found: ${body.agentAlias}` });
        return;
      }

      const contextId = body.contextId ?? randomUUID();
      const taskId = randomUUID();

      logger.info(
        { agentAlias: body.agentAlias, contextId, taskId },
        'Delegate request',
      );

      // ── Build auth headers for the external agent ────────────────────
      const authHeaders = deps.agentRegistry.buildAuthHeaders(agentConfig);

      // ── Build A2A message from text ──────────────────────────────────
      const a2aMessage = createA2AMessageFromText(body.message);

      // ── Check for existing outbound session (multi-turn) ─────────────
      let existingSession = await deps.sessionManager.getByContextId(contextId);

      // Emit outbound request event to dashboard
      const bus = getEventBus();
      bus.emitConversation({
        direction: 'outbound',
        source: 'Agentforce',
        target: body.agentAlias,
        taskId,
        contextId,
        messageType: 'request',
        content: body.message,
      });

      const startTime = Date.now();

      // ── Send to external A2A agent ───────────────────────────────────
      const task = await deps.a2aClient.sendMessage(
        agentConfig.url,
        a2aMessage,
        {
          contextId,
          taskId,
          auth: authHeaders,
        },
      );

      const latencyMs = Date.now() - startTime;

      // ── Store outbound session state ─────────────────────────────────
      if (!existingSession) {
        existingSession = await deps.sessionManager.createSession({
          contextId,
          taskId,
          afSessionId: `outbound-${agentConfig.alias}`, // virtual session for outbound
          afAgentId: agentConfig.alias,
          tenantId: deps.tenantId,
        });
      } else {
        await deps.sessionManager.addTask(contextId, taskId);
      }

      await deps.sessionManager.updateTaskState(
        contextId,
        task.status as unknown as Record<string, unknown>,
        task.artifacts as unknown as Record<string, unknown>[],
      );

      // ── Extract text response ────────────────────────────────────────
      const responseText = extractTextFromA2ATask(task);

      // Emit outbound response event to dashboard
      bus.emitConversation({
        direction: 'outbound',
        source: body.agentAlias,
        target: 'Agentforce',
        taskId: task.id,
        contextId: task.contextId ?? contextId,
        messageType: 'response',
        content: responseText,
        latencyMs,
      });

      // ── Return flat JSON ─────────────────────────────────────────────
      const result: DelegateResponse = {
        taskId: task.id,
        contextId: task.contextId ?? contextId,
        status: task.status.state,
        response: responseText,
        artifacts: (task.artifacts ?? []).map((a) => ({
          name: a.name,
          parts: a.parts.map((p) => {
            if (p.type === 'text') return { type: 'text', text: p.text };
            return { type: p.type };
          }),
          index: a.index,
        })),
      };

      res.json(result);
    } catch (err) {
      logger.error({ err }, 'Delegate handler error');

      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
      } else {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(502).json({ error: message });
      }
    }
  };
}

/**
 * Factory that creates the list-agents handler.
 *
 * GET /api/v1/agents
 */
export function createListAgentsHandler(deps: DelegateHandlerDeps) {
  return (_req: Request, res: Response): void => {
    const agents = deps.agentRegistry.listAgents().map((a) => ({
      alias: a.alias,
      url: a.url,
      description: a.description ?? '',
      authType: a.authType,
    }));

    res.json({ agents });
  };
}

/**
 * Factory that creates the discover-agent handler.
 *
 * POST /api/v1/agents/:alias/discover
 *
 * Triggers a fresh Agent Card fetch for the specified agent.
 */
export function createDiscoverAgentHandler(deps: DelegateHandlerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const alias = req.params.alias as string;
      const agentConfig = deps.agentRegistry.getAgent(alias);

      if (!agentConfig) {
        res.status(404).json({ error: `Agent not found: ${alias}` });
        return;
      }

      // Force fresh fetch by using the client's card resolver
      // We call sendMessage's internal resolver — but we can also
      // trigger resolution via a discovery endpoint:
      const { AgentCardResolver } = await import('../../a2a/client/agent-card-resolver.js');
      const resolver = new AgentCardResolver();
      const card = await resolver.resolve(agentConfig.url);

      res.json({
        alias: agentConfig.alias,
        url: agentConfig.url,
        agentCard: card,
      });
    } catch (err) {
      logger.error({ err }, 'Discover agent error');
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(502).json({ error: message });
    }
  };
}
