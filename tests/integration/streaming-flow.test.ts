import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { MemoryStore } from '../../src/session/memory-store.js';
import { resetConfig } from '../../src/config/config-manager.js';
import type { JsonRpcHandlerDeps } from '../../src/a2a/server/jsonrpc-handler.js';

const TEST_API_KEY = 'test-api-key-123';

describe('Streaming Flow (Integration)', () => {
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
        authenticate: vi.fn().mockResolvedValue('mock-token'),
        createSession: vi.fn().mockResolvedValue({ id: 'sess-1', sequenceId: 1 }),
        sendMessage: vi.fn().mockResolvedValue({
          messages: [{ type: 'Inform', message: 'Streaming reply' }],
          sequenceId: 2,
        }),
        endSession: vi.fn(),
      } as any,
      sessionManager: new SessionManager(new MemoryStore()),
      tenantId: 'test-tenant',
    };
  }

  it('should return 401 for streaming without auth', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
        params: {
          message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        },
      });

    expect(res.status).toBe(401);
  });

  it('should return error for sendSubscribe with missing params', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
      });

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32602);
  });

  it('should return error for sendSubscribe with missing message', async () => {
    const deps = makeDeps();
    const app = createApp({ a2a: deps });

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
        params: {},
      });

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32602);
  });
});
