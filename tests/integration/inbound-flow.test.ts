import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AgentforceClient } from '../../src/agentforce/client/index.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { MemoryStore } from '../../src/session/memory-store.js';
import { resetConfig } from '../../src/config/config-manager.js';
import { resetAgentCardCache } from '../../src/a2a/server/agent-card.js';
import type { Express } from 'express';

const API_KEY = 'integration-test-key';

describe('Inbound A2A → Agentforce (integration)', () => {
  let app: Express;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.API_KEY = API_KEY;
    process.env.SALESFORCE_SERVER_URL = 'test.sf.com';
    process.env.SALESFORCE_CLIENT_ID = 'cid';
    process.env.SALESFORCE_CLIENT_SECRET = 'csec';
    process.env.SALESFORCE_AGENT_ID = 'agent-1';
    process.env.SALESFORCE_CLIENT_EMAIL = 'test@test.com';
    process.env.BASE_URL = 'http://localhost:3000';
    resetConfig();
    resetAgentCardCache();

    fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Mock all Agentforce endpoints
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

      if (urlStr.includes('/agents/') && urlStr.includes('/sessions') && init?.method !== 'DELETE') {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: 'af-sess-int' }), { status: 200 }),
        );
      }

      if (init?.method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (urlStr.includes('/messages')) {
        // Parse the incoming message to create a relevant response
        const body = JSON.parse(init?.body as string);
        const seqId = body.message.sequenceId;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [
                {
                  id: `msg-${seqId}`,
                  type: 'Text',
                  message: `Response to message ${seqId}: ${body.message.text.substring(0, 30)}`,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const client = new AgentforceClient({
      serverUrl: 'test.sf.com',
      clientId: 'cid',
      clientSecret: 'csec',
      clientEmail: 'test@test.com',
      agentId: 'agent-1',
    });
    const sessionManager = new SessionManager(new MemoryStore());

    app = createApp({
      a2a: {
        agentforceClient: client,
        sessionManager,
        tenantId: 'test-tenant',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfig();
    resetAgentCardCache();
  });

  it('Agent Card is publicly available', async () => {
    const res = await request(app).get('/.well-known/agent-card.json');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Agentforce Proxy');
    expect(res.body.url).toBe('http://localhost:3000/a2a');
    expect(res.body.capabilities.streaming).toBe(true);
    expect(res.body.authentication.schemes).toContain('bearer');
  });

  it('Full inbound flow: send → get → cancel', async () => {
    // 1. Send first message
    const send1 = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'tasks/send',
        params: {
          id: 'task-int-1',
          message: {
            role: 'user',
            parts: [{ type: 'text', text: 'Find hotels near CDG airport' }],
          },
        },
      });

    expect(send1.body.error).toBeUndefined();
    const task1 = send1.body.result;
    expect(task1.id).toBe('task-int-1');
    expect(task1.contextId).toBeDefined();
    expect(task1.status.state).toBe('completed');
    expect(task1.artifacts[0].parts[0].text).toContain('Response to message 1');

    const contextId = task1.contextId;

    // 2. Send follow-up with same contextId
    const send2 = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 'req-2',
        method: 'tasks/send',
        params: {
          id: 'task-int-2',
          contextId,
          message: {
            role: 'user',
            parts: [{ type: 'text', text: 'Under 100 EUR please' }],
          },
        },
      });

    expect(send2.body.error).toBeUndefined();
    const task2 = send2.body.result;
    expect(task2.contextId).toBe(contextId); // same context
    expect(task2.artifacts[0].parts[0].text).toContain('Response to message 2'); // sequenceId incremented

    // 3. Get task
    const getRes = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 'req-3',
        method: 'tasks/get',
        params: { id: 'task-int-2' },
      });

    expect(getRes.body.error).toBeUndefined();
    expect(getRes.body.result.id).toBe('task-int-2');
    expect(getRes.body.result.status.state).toBe('completed');

    // 4. Cancel (will cancel the context's Agentforce session)
    const cancelRes = await request(app)
      .post('/a2a')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        jsonrpc: '2.0',
        id: 'req-4',
        method: 'tasks/cancel',
        params: { id: 'task-int-1' },
      });

    expect(cancelRes.body.error).toBeUndefined();
    expect(cancelRes.body.result.status.state).toBe('canceled');
  });

  it('Health check still works with A2A routes', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('Rejects unauthenticated A2A requests', async () => {
    const res = await request(app)
      .post('/a2a')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/send',
        params: {
          message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
        },
      });

    expect(res.status).toBe(401);
  });
});
