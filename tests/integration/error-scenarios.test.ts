import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { MemoryStore } from '../../src/session/memory-store.js';
import { resetConfig } from '../../src/config/config-manager.js';
import type { JsonRpcHandlerDeps } from '../../src/a2a/server/jsonrpc-handler.js';

const TEST_API_KEY = 'test-api-key-123';

describe('Error Scenarios (Integration)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.API_KEY = TEST_API_KEY;
    resetConfig();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_KEY;
    resetConfig();
  });

  function makeDeps(): JsonRpcHandlerDeps {
    return {
      agentforceClient: {
        authenticate: vi.fn(),
        createSession: vi.fn(),
        sendMessage: vi.fn(),
        endSession: vi.fn(),
      } as any,
      sessionManager: new SessionManager(new MemoryStore()),
      tenantId: 'test-tenant',
    };
  }

  it('should return 401 for missing Authorization header on A2A endpoint', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} });

    expect(res.status).toBe(401);
  });

  it('should return 401 for wrong Bearer token', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', 'Bearer wrong-key')
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} });

    expect(res.status).toBe(401);
  });

  it('should return JSON-RPC error for unknown method', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/unknownMethod' });

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32601);
  });

  it('should return JSON-RPC error for missing params in tasks/send', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send' });

    expect(res.body.error).toBeDefined();
    // When params is entirely absent, it may be -32602 (invalid params) or -32603 (internal)
    expect([-32602, -32603]).toContain(res.body.error.code);
  });

  it('should handle Agentforce auth failure gracefully', async () => {
    const deps = makeDeps();

    // Mock authenticate to throw
    (deps.agentforceClient.authenticate as any).mockRejectedValue(
      new Error('OAuth failed'),
    );

    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/send',
        params: {
          message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        },
      });

    expect(res.body.error).toBeDefined();
  });

  it('should return task not found for unknown task ID in tasks/get', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/get',
        params: { id: 'nonexistent-task-id' },
      });

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32001); // task not found
  });
});
