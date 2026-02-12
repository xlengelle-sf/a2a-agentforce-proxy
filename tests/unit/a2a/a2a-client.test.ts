import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentCardResolver } from '../../../src/a2a/client/agent-card-resolver.js';
import { A2AClient } from '../../../src/a2a/client/a2a-client.js';
import type { A2AMessage, A2ATask, AgentCard } from '../../../src/a2a/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_CARD: AgentCard = {
  name: 'Test Agent',
  description: 'A test A2A agent',
  url: 'https://test-agent.example.com/a2a',
  version: '0.3.0',
  capabilities: { streaming: false, pushNotifications: false },
  authentication: { schemes: ['bearer'] },
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [{ id: 'test', name: 'Test', description: 'Test skill' }],
};

const MOCK_TASK: A2ATask = {
  id: 'task-123',
  contextId: 'ctx-456',
  status: { state: 'completed', timestamp: '2026-02-12T10:00:00Z' },
  artifacts: [
    { name: 'response', parts: [{ type: 'text', text: 'Hello from agent' }], index: 0 },
  ],
};

function jsonRpcSuccess(id: string, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

const SIMPLE_MESSAGE: A2AMessage = {
  role: 'user',
  parts: [{ type: 'text', text: 'Hello agent' }],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('A2AClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let cardResolver: AgentCardResolver;
  let client: A2AClient;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    cardResolver = new AgentCardResolver();
    // Mock the resolver to return our card directly
    vi.spyOn(cardResolver, 'resolve').mockResolvedValue(MOCK_CARD);
    client = new A2AClient(cardResolver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should send a JSON-RPC tasks/send request and return the task', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonRpcSuccess('req-1', MOCK_TASK)), { status: 200 }),
        ),
      );

      const task = await client.sendMessage(
        'https://test-agent.example.com',
        SIMPLE_MESSAGE,
        { taskId: 'task-123', contextId: 'ctx-456' },
      );

      expect(task.id).toBe('task-123');
      expect(task.status.state).toBe('completed');
      expect(task.artifacts?.[0]?.parts[0]).toEqual({ type: 'text', text: 'Hello from agent' });

      // Verify it posted to the card's URL
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test-agent.example.com/a2a',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('tasks/send'),
        }),
      );
    });

    it('should include auth headers when provided', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonRpcSuccess('req-1', MOCK_TASK)), { status: 200 }),
        ),
      );

      await client.sendMessage(
        'https://test-agent.example.com',
        SIMPLE_MESSAGE,
        { auth: { Authorization: 'Bearer secret-token' } },
      );

      const [, fetchInit] = fetchSpy.mock.calls[0];
      const headers = fetchInit?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer secret-token');
    });

    it('should generate taskId and contextId when not provided', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonRpcSuccess('req-1', MOCK_TASK)), { status: 200 }),
        ),
      );

      await client.sendMessage(
        'https://test-agent.example.com',
        SIMPLE_MESSAGE,
      );

      const body = JSON.parse((fetchSpy.mock.calls[0][1]?.body as string));
      expect(body.params.id).toBeDefined();
      expect(body.params.contextId).toBeDefined();
      expect(body.method).toBe('tasks/send');
    });

    it('should throw UpstreamError on JSON-RPC error response', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(jsonRpcError('req-1', -32603, 'Internal error')),
            { status: 200 },
          ),
        ),
      );

      await expect(
        client.sendMessage('https://test-agent.example.com', SIMPLE_MESSAGE),
      ).rejects.toThrow(/Internal error/);
    });

    it('should throw UpstreamError on HTTP error', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(new Response('Server Error', { status: 500 })),
      );

      await expect(
        client.sendMessage('https://test-agent.example.com', SIMPLE_MESSAGE),
      ).rejects.toThrow(/HTTP 500/);
    });

    it('should throw UpstreamError on network failure', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.reject(new TypeError('fetch failed')),
      );

      await expect(
        client.sendMessage('https://test-agent.example.com', SIMPLE_MESSAGE),
      ).rejects.toThrow(/A2A request failed/);
    });

    it('should throw on timeout', async () => {
      fetchSpy.mockImplementation((_url, init) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve(new Response('ok', { status: 200 })),
            500,
          );
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      });

      const fastClient = new A2AClient(cardResolver, { timeoutMs: 50 });

      await expect(
        fastClient.sendMessage('https://test-agent.example.com', SIMPLE_MESSAGE),
      ).rejects.toThrow(/timed out/);
    });
  });

  // ── getTask ──────────────────────────────────────────────────────────────

  describe('getTask', () => {
    it('should send tasks/get and return the task', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonRpcSuccess('req-1', MOCK_TASK)), { status: 200 }),
        ),
      );

      const task = await client.getTask('https://test-agent.example.com', 'task-123');

      expect(task.id).toBe('task-123');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.method).toBe('tasks/get');
      expect(body.params.id).toBe('task-123');
    });
  });

  // ── cancelTask ───────────────────────────────────────────────────────────

  describe('cancelTask', () => {
    it('should send tasks/cancel and return the task', async () => {
      const canceledTask = { ...MOCK_TASK, status: { state: 'canceled', timestamp: '2026-02-12T10:00:00Z' } };

      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonRpcSuccess('req-1', canceledTask)), { status: 200 }),
        ),
      );

      const task = await client.cancelTask('https://test-agent.example.com', 'task-123');

      expect(task.status.state).toBe('canceled');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.method).toBe('tasks/cancel');
      expect(body.params.id).toBe('task-123');
    });

    it('should forward auth headers for cancelTask', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonRpcSuccess('req-1', MOCK_TASK)), { status: 200 }),
        ),
      );

      await client.cancelTask(
        'https://test-agent.example.com',
        'task-123',
        { 'X-API-Key': 'my-key' },
      );

      const [, fetchInit] = fetchSpy.mock.calls[0];
      const headers = fetchInit?.headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('my-key');
    });
  });
});
