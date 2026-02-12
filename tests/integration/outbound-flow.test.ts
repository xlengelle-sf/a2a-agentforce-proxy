import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AgentCardResolver } from '../../src/a2a/client/agent-card-resolver.js';
import { A2AClient } from '../../src/a2a/client/a2a-client.js';
import { AgentRegistry } from '../../src/config/agent-registry.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { MemoryStore } from '../../src/session/memory-store.js';
import { resetConfig } from '../../src/config/config-manager.js';
import type { Express } from 'express';
import type { A2ATask } from '../../src/a2a/types.js';

const DELEGATE_API_KEY = 'outbound-integration-key';

describe('Outbound Agentforce → A2A (integration)', () => {
  let app: Express;
  let a2aClient: A2AClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DELEGATE_API_KEY = DELEGATE_API_KEY;
    process.env.API_KEY = 'inbound-key';
    process.env.SALESFORCE_SERVER_URL = 'test.sf.com';
    process.env.SALESFORCE_CLIENT_ID = 'cid';
    process.env.SALESFORCE_CLIENT_SECRET = 'csec';
    process.env.SALESFORCE_AGENT_ID = 'agent-1';
    process.env.SALESFORCE_CLIENT_EMAIL = 'test@test.com';
    process.env.BASE_URL = 'http://localhost:3000';
    resetConfig();

    fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Set up A2A client with mocked card resolver
    const cardResolver = new AgentCardResolver();
    a2aClient = new A2AClient(cardResolver);

    // Mock A2A sendMessage to simulate an external agent response
    vi.spyOn(a2aClient, 'sendMessage').mockImplementation(
      async (_url, _msg, opts): Promise<A2ATask> => ({
        id: opts?.taskId ?? 'task-gen',
        contextId: opts?.contextId ?? 'ctx-gen',
        status: { state: 'completed', timestamp: new Date().toISOString() },
        artifacts: [
          {
            name: 'response',
            parts: [{ type: 'text', text: 'Tomorrow in Paris: 18°C, partly cloudy with a chance of rain.' }],
            index: 0,
          },
        ],
      }),
    );

    // Agent registry
    const agentRegistry = new AgentRegistry('/nonexistent');
    vi.spyOn(agentRegistry, 'getAgent').mockImplementation((alias) => {
      if (alias === 'weather-agent') {
        return {
          alias: 'weather-agent',
          url: 'https://weather.example.com',
          description: 'Weather forecasts',
          authType: 'bearer',
          authToken: 'test-token',
        };
      }
      return null;
    });
    vi.spyOn(agentRegistry, 'listAgents').mockReturnValue([
      {
        alias: 'weather-agent',
        url: 'https://weather.example.com',
        description: 'Weather forecasts',
        authType: 'bearer',
        authToken: 'test-token',
      },
    ]);
    vi.spyOn(agentRegistry, 'buildAuthHeaders').mockReturnValue({
      Authorization: 'Bearer test-token',
    });

    const sessionManager = new SessionManager(new MemoryStore());

    app = createApp({
      delegate: {
        a2aClient,
        agentRegistry,
        sessionManager,
        tenantId: 'test-tenant',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfig();
  });

  it('Full outbound flow: delegate → external A2A agent → response', async () => {
    const res = await request(app)
      .post('/api/v1/delegate')
      .set('X-API-Key', DELEGATE_API_KEY)
      .send({
        agentAlias: 'weather-agent',
        message: 'What is the weather in Paris tomorrow?',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.response).toContain('18°C');
    expect(res.body.response).toContain('partly cloudy');
    expect(res.body.taskId).toBeDefined();
    expect(res.body.contextId).toBeDefined();
    expect(res.body.artifacts).toHaveLength(1);
  });

  it('Multi-turn delegate conversation', async () => {
    // First message
    const res1 = await request(app)
      .post('/api/v1/delegate')
      .set('X-API-Key', DELEGATE_API_KEY)
      .send({
        agentAlias: 'weather-agent',
        message: 'Weather in Paris?',
        contextId: 'ctx-multiturn-int',
      });

    expect(res1.status).toBe(200);

    // Follow-up with same contextId
    const res2 = await request(app)
      .post('/api/v1/delegate')
      .set('X-API-Key', DELEGATE_API_KEY)
      .send({
        agentAlias: 'weather-agent',
        message: 'What about London?',
        contextId: 'ctx-multiturn-int',
      });

    expect(res2.status).toBe(200);

    // Both should use same contextId
    const calls = (a2aClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][2].contextId).toBe('ctx-multiturn-int');
    expect(calls[1][2].contextId).toBe('ctx-multiturn-int');
  });

  it('List agents endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/agents')
      .set('X-API-Key', DELEGATE_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0].alias).toBe('weather-agent');
  });

  it('Health check still works with delegate routes', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('Rejects unauthenticated delegate request', async () => {
    const res = await request(app)
      .post('/api/v1/delegate')
      .send({ agentAlias: 'weather-agent', message: 'Hello' });

    expect(res.status).toBe(401);
  });

  it('Returns 404 for unknown agent alias', async () => {
    const res = await request(app)
      .post('/api/v1/delegate')
      .set('X-API-Key', DELEGATE_API_KEY)
      .send({ agentAlias: 'nonexistent', message: 'Hello' });

    expect(res.status).toBe(404);
  });
});
