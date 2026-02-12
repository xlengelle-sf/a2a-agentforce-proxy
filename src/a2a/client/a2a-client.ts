import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/logger.js';
import { UpstreamError, ValidationError } from '../../shared/errors.js';
import type { AgentCardResolver } from './agent-card-resolver.js';
import type {
  A2AMessage,
  A2ATask,
  JsonRpcResponse,
  AgentCard,
} from '../types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface A2AClientOptions {
  timeoutMs?: number;
}

export interface SendMessageOptions {
  contextId?: string;
  taskId?: string;
  auth?: Record<string, string>; // headers to add
}

// ─── Client ─────────────────────────────────────────────────────────────────

/**
 * A2A protocol client for communicating with external A2A-compatible agents.
 *
 * Discovers agents via Agent Card, builds JSON-RPC 2.0 requests,
 * and parses Task responses.
 */
export class A2AClient {
  private readonly cardResolver: AgentCardResolver;
  private readonly timeoutMs: number;

  constructor(cardResolver: AgentCardResolver, opts?: A2AClientOptions) {
    this.cardResolver = cardResolver;
    this.timeoutMs = opts?.timeoutMs ?? 120_000; // 2 minutes
  }

  /**
   * Send a message to an external A2A agent via tasks/send.
   */
  async sendMessage(
    agentUrl: string,
    message: A2AMessage,
    options?: SendMessageOptions,
  ): Promise<A2ATask> {
    const card = await this.cardResolver.resolve(agentUrl);
    const taskId = options?.taskId ?? randomUUID();
    const contextId = options?.contextId ?? randomUUID();

    const rpcRequest = {
      jsonrpc: '2.0' as const,
      id: `req-${randomUUID()}`,
      method: 'tasks/send',
      params: {
        id: taskId,
        contextId,
        message,
      },
    };

    logger.info(
      { agentUrl, taskId, contextId, method: 'tasks/send' },
      'Sending A2A request',
    );

    const rpcResponse = await this.postJsonRpc(card.url, rpcRequest, options?.auth);
    return this.extractTask(rpcResponse, agentUrl);
  }

  /**
   * Get the status/result of a task from an external A2A agent.
   */
  async getTask(
    agentUrl: string,
    taskId: string,
    auth?: Record<string, string>,
  ): Promise<A2ATask> {
    const card = await this.cardResolver.resolve(agentUrl);

    const rpcRequest = {
      jsonrpc: '2.0' as const,
      id: `req-${randomUUID()}`,
      method: 'tasks/get',
      params: { id: taskId },
    };

    const rpcResponse = await this.postJsonRpc(card.url, rpcRequest, auth);
    return this.extractTask(rpcResponse, agentUrl);
  }

  /**
   * Cancel a task on an external A2A agent.
   */
  async cancelTask(
    agentUrl: string,
    taskId: string,
    auth?: Record<string, string>,
  ): Promise<A2ATask> {
    const card = await this.cardResolver.resolve(agentUrl);

    const rpcRequest = {
      jsonrpc: '2.0' as const,
      id: `req-${randomUUID()}`,
      method: 'tasks/cancel',
      params: { id: taskId },
    };

    const rpcResponse = await this.postJsonRpc(card.url, rpcRequest, auth);
    return this.extractTask(rpcResponse, agentUrl);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async postJsonRpc(
    endpoint: string,
    body: Record<string, unknown>,
    authHeaders?: Record<string, string>,
  ): Promise<JsonRpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new UpstreamError(`A2A request timed out: ${endpoint}`, endpoint);
      }
      throw new UpstreamError(
        `A2A request failed: ${(err as Error).message}`,
        endpoint,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new UpstreamError(
        `A2A agent returned HTTP ${response.status}: ${text.slice(0, 200)}`,
        endpoint,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ValidationError('Invalid JSON in A2A agent response');
    }

    return parsed as JsonRpcResponse;
  }

  private extractTask(rpcResponse: JsonRpcResponse, agentUrl: string): A2ATask {
    if (rpcResponse.error) {
      throw new UpstreamError(
        `A2A agent returned error: [${rpcResponse.error.code}] ${rpcResponse.error.message}`,
        agentUrl,
      );
    }

    if (!rpcResponse.result) {
      throw new UpstreamError('A2A agent returned empty result', agentUrl);
    }

    return rpcResponse.result as A2ATask;
  }
}
