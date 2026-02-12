import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDelegateRouter } from '../../../src/agentforce/action-endpoint/index.js';
import { A2AClient } from '../../../src/a2a/client/a2a-client.js';
import { AgentCardResolver } from '../../../src/a2a/client/agent-card-resolver.js';
import { AgentRegistry } from '../../../src/config/agent-registry.js';
import { SessionManager } from '../../../src/session/session-manager.js';
import { MemoryStore } from '../../../src/session/memory-store.js';
import { resetConfig } from '../../../src/config/config-manager.js';
import { UpstreamError } from '../../../src/shared/errors.js';
import type { A2ATask } from '../../../src/a2a/types.js';

const DELEGATE_API_KEY = 'delegate-test-key';

function createTestApp(overrides?: {
  sendMessageResult?: A2ATask;
  sendMessageError?: Error;
}) {
  // Set up env
  process.env.DELEGATE_API_KEY = DELEGATE_API_KEY;
  process.env.API_KEY = 'inbound-key';
  process.env.SALESFORCE_SERVER_URL = 'test.sf.com';
  process.env.SALESFORCE_CLIENT_ID = 'cid';
  process.env.SALESFORCE_CLIENT_SECRET = 'csec';
  process.env.SALESFORCE_AGENT_ID = 'agent-1';
  process.env.SALESFORCE_CLIENT_EMAIL = 'test@test.com';
  resetConfig();

  // Mock A2A client
  const cardResolver = new AgentCardResolver();
  const a2aClient = new A2AClient(cardResolver);

  const defaultTask: A2ATask = {
    id: 'task-out-1',
    contextId: 'ctx-out-1',
    status: { state: 'completed', timestamp: '2026-02-12T10:00:00Z' },
    artifacts: [
      { name: 'response', parts: [{ type: 'text', text: 'The weather in Paris is sunny, 20°C' }], index: 0 },
    ],
  };

  if (overrides?.sendMessageError) {
    vi.spyOn(a2aClient, 'sendMessage').mockRejectedValue(overrides.sendMessageError);
  } else {
    vi.spyOn(a2aClient, 'sendMessage').mockResolvedValue(
      overrides?.sendMessageResult ?? defaultTask,
    );
  }

  // Agent registry with test agents
  const agentRegistry = new AgentRegistry('/nonexistent'); // empty registry
  vi.spyOn(agentRegistry, 'listAgents').mockReturnValue([
    {
      alias: 'weather-agent',
      url: 'https://weather.example.com',
      description: 'Weather forecasts',
      authType: 'bearer',
      authToken: 'test-token',
    },
    {
      alias: 'open-agent',
      url: 'https://open.example.com',
      description: 'Open agent',
      authType: 'none',
    },
  ]);

  vi.spyOn(agentRegistry, 'getAgent').mockImplementation((alias: string) => {
    if (alias === 'weather-agent') {
      return {
        alias: 'weather-agent',
        url: 'https://weather.example.com',
        description: 'Weather forecasts',
        authType: 'bearer',
        authToken: 'test-token',
      };
    }
    if (alias === 'open-agent') {
      return {
        alias: 'open-agent',
        url: 'https://open.example.com',
        description: 'Open agent',
        authType: 'none',
      };
    }
    return null;
  });

  vi.spyOn(agentRegistry, 'buildAuthHeaders').mockImplementation((agent) => {
    if (agent.authType === 'bearer' && agent.authToken) {
      return { Authorization: `Bearer ${agent.authToken}` };
    }
    return {};
  });

  const sessionManager = new SessionManager(new MemoryStore());

  const app = express();
  app.use(express.json());
  app.use(
    createDelegateRouter({
      a2aClient,
      agentRegistry,
      sessionManager,
      tenantId: 'test-tenant',
    }),
  );

  return { app, a2aClient, agentRegistry, sessionManager };
}

describe('Delegate Endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetConfig();
  });

  // ── POST /api/v1/delegate ─────────────────────────────────────────────

  describe('POST /api/v1/delegate', () => {
    it('should delegate a message and return response', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({
          agentAlias: 'weather-agent',
          message: 'What is the weather in Paris?',
        });

      expect(res.status).toBe(200);
      expect(res.body.taskId).toBe('task-out-1');
      expect(res.body.contextId).toBe('ctx-out-1');
      expect(res.body.status).toBe('completed');
      expect(res.body.response).toBe('The weather in Paris is sunny, 20°C');
      expect(res.body.artifacts).toHaveLength(1);
    });

    it('should reuse contextId for multi-turn', async () => {
      const { app, a2aClient } = createTestApp();

      // First message
      const res1 = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({
          agentAlias: 'weather-agent',
          message: 'What is the weather in Paris?',
          contextId: 'ctx-multiturn',
        });

      expect(res1.status).toBe(200);

      // Second message with same contextId
      const res2 = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({
          agentAlias: 'weather-agent',
          message: 'What about tomorrow?',
          contextId: 'ctx-multiturn',
        });

      expect(res2.status).toBe(200);

      // A2A client should have been called with the same contextId
      const calls = (a2aClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][2].contextId).toBe('ctx-multiturn');
      expect(calls[1][2].contextId).toBe('ctx-multiturn');
    });

    it('should return 400 when agentAlias is missing', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({ message: 'Hello' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('agentAlias');
    });

    it('should return 400 when message is missing', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({ agentAlias: 'weather-agent' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message');
    });

    it('should return 404 when agent is not found', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({ agentAlias: 'nonexistent', message: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('nonexistent');
    });

    it('should return 401 when X-API-Key is missing', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/delegate')
        .send({ agentAlias: 'weather-agent', message: 'Hello' });

      expect(res.status).toBe(401);
    });

    it('should return 401 when X-API-Key is wrong', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', 'wrong-key')
        .send({ agentAlias: 'weather-agent', message: 'Hello' });

      expect(res.status).toBe(401);
    });

    it('should return 502 on upstream error', async () => {
      const { app } = createTestApp({
        sendMessageError: new UpstreamError('Agent unreachable', 'https://weather.example.com'),
      });

      const res = await request(app)
        .post('/api/v1/delegate')
        .set('X-API-Key', DELEGATE_API_KEY)
        .send({ agentAlias: 'weather-agent', message: 'Hello' });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Agent unreachable');
    });
  });

  // ── GET /api/v1/agents ────────────────────────────────────────────────

  describe('GET /api/v1/agents', () => {
    it('should list configured agents', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .get('/api/v1/agents')
        .set('X-API-Key', DELEGATE_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.agents).toHaveLength(2);
      expect(res.body.agents[0].alias).toBe('weather-agent');
      expect(res.body.agents[1].alias).toBe('open-agent');
    });

    it('should reject unauthenticated request', async () => {
      const { app } = createTestApp();

      const res = await request(app).get('/api/v1/agents');
      expect(res.status).toBe(401);
    });
  });
});
