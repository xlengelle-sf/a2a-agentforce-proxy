import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createJsonRpcHandler, type JsonRpcHandlerDeps } from '../../../src/a2a/server/jsonrpc-handler.js';
import { AgentforceClient } from '../../../src/agentforce/client/index.js';
import { SessionManager } from '../../../src/session/session-manager.js';
import { MemoryStore } from '../../../src/session/memory-store.js';
import { bearerAuth } from '../../../src/shared/middleware/auth.js';
import { resetConfig } from '../../../src/config/config-manager.js';

// Set up config env
const TEST_API_KEY = 'test-api-key';

function makeDeps(): JsonRpcHandlerDeps {
  const client = new AgentforceClient({
    serverUrl: 'test.sf.com',
    clientId: 'cid',
    clientSecret: 'csec',
    clientEmail: 'test@test.com',
    agentId: 'agent-1',
  });

  const sessionManager = new SessionManager(new MemoryStore());

  return { agentforceClient: client, sessionManager, tenantId: 'test-tenant' };
}

function makeApp(deps: JsonRpcHandlerDeps) {
  const app = express();
  app.use(express.json());
  app.post('/a2a', bearerAuth, createJsonRpcHandler(deps));
  return app;
}

describe('JSON-RPC Handler', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.API_KEY = TEST_API_KEY;
    process.env.SALESFORCE_SERVER_URL = 'test.sf.com';
    process.env.SALESFORCE_CLIENT_ID = 'cid';
    process.env.SALESFORCE_CLIENT_SECRET = 'csec';
    process.env.SALESFORCE_AGENT_ID = 'agent-1';
    process.env.SALESFORCE_CLIENT_EMAIL = 'test@test.com';
    process.env.BASE_URL = 'http://localhost:3000';
    resetConfig();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfig();
  });

  it('rejects requests without auth', async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app)
      .post('/a2a')
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} });

    expect(res.status).toBe(401);
  });

  it('returns error for invalid JSON-RPC version', async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ jsonrpc: '1.0', id: 1, method: 'tasks/send' });

    expect(res.body.error.code).toBe(-32600);
  });

  it('returns error for missing method', async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ jsonrpc: '2.0', id: 1 });

    expect(res.body.error.code).toBe(-32600);
  });

  it('returns method-not-found for unknown method', async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'foobar' });

    expect(res.body.error.code).toBe(-32601);
  });

  it('returns invalid-params for tasks/sendSubscribe with missing params', async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/sendSubscribe' });

    expect(res.body.error.code).toBe(-32602);
  });

  describe('tasks/send', () => {
    it('creates session and returns A2A task', async () => {
      // Mock Agentforce OAuth
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes('/oauth2/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'tok',
                instance_url: 'https://my.sf.com',
                id: 'id',
                token_type: 'Bearer',
                issued_at: '123',
                signature: 'sig',
              }),
              { status: 200 },
            ),
          );
        }

        if (urlStr.includes('/sessions') && !urlStr.includes('/messages')) {
          return Promise.resolve(
            new Response(JSON.stringify({ sessionId: 'af-sess-1' }), { status: 200 }),
          );
        }

        if (urlStr.includes('/messages')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                messages: [
                  {
                    id: 'msg-1',
                    type: 'Text',
                    message: 'Here are 3 hotels near CDG airport.',
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const deps = makeDeps();
      const app = makeApp(deps);

      const res = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 'req-1',
          method: 'tasks/send',
          params: {
            message: {
              role: 'user',
              parts: [{ type: 'text', text: 'Find hotels near CDG' }],
            },
          },
        });

      expect(res.body.jsonrpc).toBe('2.0');
      expect(res.body.id).toBe('req-1');
      expect(res.body.error).toBeUndefined();

      const task = res.body.result;
      expect(task.id).toBeDefined();
      expect(task.contextId).toBeDefined();
      expect(task.status.state).toBe('completed');
      expect(task.artifacts).toHaveLength(1);
      expect(task.artifacts[0].parts[0].text).toContain('3 hotels');
    });

    it('reuses session for same contextId', async () => {
      let sessionCreateCount = 0;

      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes('/oauth2/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'tok',
                instance_url: 'https://my.sf.com',
                id: 'id',
                token_type: 'Bearer',
                issued_at: '123',
                signature: 'sig',
              }),
              { status: 200 },
            ),
          );
        }

        if (urlStr.includes('/agents/') && urlStr.includes('/sessions')) {
          sessionCreateCount++;
          return Promise.resolve(
            new Response(JSON.stringify({ sessionId: 'af-sess-1' }), { status: 200 }),
          );
        }

        if (urlStr.includes('/messages')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                messages: [{ id: 'msg', type: 'Text', message: 'Reply' }],
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const deps = makeDeps();
      const app = makeApp(deps);
      const contextId = 'shared-ctx';

      // First message
      await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/send',
          params: {
            contextId,
            message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
          },
        });

      // Second message — same contextId
      await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tasks/send',
          params: {
            contextId,
            message: { role: 'user', parts: [{ type: 'text', text: 'Follow up' }] },
          },
        });

      // Session should have been created only once
      expect(sessionCreateCount).toBe(1);
    });

    it('returns error for missing message parts', async () => {
      const deps = makeDeps();
      const app = makeApp(deps);

      const res = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/send',
          params: { message: { role: 'user', parts: [] } },
        });

      expect(res.body.error).toBeDefined();
    });
  });

  describe('tasks/get', () => {
    it('returns cached task state', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes('/oauth2/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'tok',
                instance_url: 'https://my.sf.com',
                id: 'id',
                token_type: 'Bearer',
                issued_at: '123',
                signature: 'sig',
              }),
              { status: 200 },
            ),
          );
        }
        if (urlStr.includes('/sessions') && !urlStr.includes('/messages')) {
          return Promise.resolve(
            new Response(JSON.stringify({ sessionId: 'af-sess-1' }), { status: 200 }),
          );
        }
        if (urlStr.includes('/messages')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                messages: [{ id: 'msg', type: 'Text', message: 'Done.' }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const deps = makeDeps();
      const app = makeApp(deps);

      // First, send a task
      const sendRes = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/send',
          params: {
            id: 'task-get-test',
            message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
          },
        });

      const contextId = sendRes.body.result.contextId;

      // Now get the task
      const getRes = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tasks/get',
          params: { id: 'task-get-test' },
        });

      expect(getRes.body.result.id).toBe('task-get-test');
      expect(getRes.body.result.contextId).toBe(contextId);
      expect(getRes.body.result.status.state).toBe('completed');
    });

    it('returns error for unknown task', async () => {
      const deps = makeDeps();
      const app = makeApp(deps);

      const res = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/get',
          params: { id: 'nonexistent' },
        });

      expect(res.body.error).toBeDefined();
    });
  });

  describe('tasks/cancel', () => {
    it('cancels an active task', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes('/oauth2/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'tok',
                instance_url: 'https://my.sf.com',
                id: 'id',
                token_type: 'Bearer',
                issued_at: '123',
                signature: 'sig',
              }),
              { status: 200 },
            ),
          );
        }
        if (urlStr.includes('/sessions') && !urlStr.includes('/messages') && init?.method !== 'DELETE') {
          return Promise.resolve(
            new Response(JSON.stringify({ sessionId: 'af-sess-1' }), { status: 200 }),
          );
        }
        if (init?.method === 'DELETE') {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (urlStr.includes('/messages')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                messages: [{ id: 'msg', type: 'Text', message: 'Working on it' }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const deps = makeDeps();
      const app = makeApp(deps);

      // Send a task first
      await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/send',
          params: {
            id: 'task-cancel-test',
            message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
          },
        });

      // Cancel it
      const cancelRes = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tasks/cancel',
          params: { id: 'task-cancel-test' },
        });

      expect(cancelRes.body.result.status.state).toBe('canceled');
    });

    it('returns error for unknown task', async () => {
      const deps = makeDeps();
      const app = makeApp(deps);

      const res = await request(app)
        .post('/a2a')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/cancel',
          params: { id: 'nonexistent' },
        });

      expect(res.body.error).toBeDefined();
    });
  });
});
