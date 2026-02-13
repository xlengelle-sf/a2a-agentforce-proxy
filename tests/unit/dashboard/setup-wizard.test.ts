/**
 * Tests for Setup Wizard API handlers.
 *
 * All Salesforce interactions are mocked — no real API calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks — must be set up before importing the module under test ──────────

// Shared mock state — mutated per test
let authGetTokenImpl: () => Promise<unknown> = async () => ({});
let sessionCreateImpl: (...args: unknown[]) => Promise<string> = async () => 'mock-session';
let sessionDeleteImpl: (...args: unknown[]) => Promise<void> = async () => {};
let messagingSendImpl: (...args: unknown[]) => Promise<unknown> = async () => ({ text: '', raw: {} });

// Track calls for assertions
let sessionCreateCalls: unknown[][] = [];
let sessionDeleteCalls: unknown[][] = [];
let messagingSendCalls: unknown[][] = [];

vi.mock('../../../src/agentforce/client/auth.js', () => ({
  AgentforceAuth: class {
    async getToken() {
      return authGetTokenImpl();
    }
  },
}));

vi.mock('../../../src/agentforce/client/session.js', () => ({
  AgentforceSession: class {
    async create(...args: unknown[]) {
      sessionCreateCalls.push(args);
      return sessionCreateImpl(...args);
    }
    async delete(...args: unknown[]) {
      sessionDeleteCalls.push(args);
      return sessionDeleteImpl(...args);
    }
  },
}));

vi.mock('../../../src/agentforce/client/messaging.js', () => ({
  AgentforceMessaging: class {
    async send(...args: unknown[]) {
      messagingSendCalls.push(args);
      return messagingSendImpl(...args);
    }
  },
}));

// Mock global fetch for discover-agents
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Now import the handlers
import {
  handleTestOAuth,
  handleDiscoverAgents,
  handleTestSession,
  handleTestMessage,
  handleVerifyProxy,
} from '../../../src/dashboard/setup-wizard.js';

// ── Test helpers ───────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/test-oauth', handleTestOAuth);
  app.post('/discover-agents', handleDiscoverAgents);
  app.post('/test-session', handleTestSession);
  app.post('/test-message', handleTestMessage);
  app.get('/verify-proxy', handleVerifyProxy);

  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Setup Wizard API Handlers', () => {
  const originalEnv = { ...process.env };
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Reset call trackers
    sessionCreateCalls = [];
    sessionDeleteCalls = [];
    messagingSendCalls = [];

    // Reset implementations to defaults
    authGetTokenImpl = async () => ({
      accessToken: 'mock-token',
      instanceUrl: 'https://mock.salesforce.com',
      expiresAt: Date.now() + 3600_000,
    });
    sessionCreateImpl = async () => 'mock-session';
    sessionDeleteImpl = async () => {};
    messagingSendImpl = async () => ({ text: 'mock response', raw: {} });

    app = createApp();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── Test OAuth ────────────────────────────────────────────────────

  describe('POST /test-oauth', () => {
    const validBody = {
      serverUrl: 'login.salesforce.com',
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret',
      clientEmail: 'agent@example.com',
    };

    it('should return success when OAuth succeeds', async () => {
      authGetTokenImpl = async () => ({
        accessToken: 'test-token',
        instanceUrl: 'https://my-instance.salesforce.com',
        expiresAt: Date.now() + 3600_000,
      });

      const res = await request(app).post('/test-oauth').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBe('test-token');
      expect(res.body.instanceUrl).toBe('https://my-instance.salesforce.com');
      expect(res.body.latencyMs).toBeTypeOf('number');
      expect(res.body.message).toContain('successful');
    });

    it('should return failure when OAuth throws', async () => {
      authGetTokenImpl = async () => {
        throw new Error('Invalid client credentials');
      };

      const res = await request(app).post('/test-oauth').send(validBody);

      expect(res.status).toBe(200); // Still 200, with success: false
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid client credentials');
    });

    it('should return 400 when required fields are missing', async () => {
      const res1 = await request(app).post('/test-oauth').send({});
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Missing required fields');

      const res2 = await request(app)
        .post('/test-oauth')
        .send({ serverUrl: 'x', clientId: 'y' }); // missing clientSecret, clientEmail
      expect(res2.status).toBe(400);
    });

    it('should return 400 when serverUrl is missing', async () => {
      const res = await request(app)
        .post('/test-oauth')
        .send({ clientId: 'a', clientSecret: 'b', clientEmail: 'c' });
      expect(res.status).toBe(400);
    });
  });

  // ─── Discover Agents ───────────────────────────────────────────────

  describe('POST /discover-agents', () => {
    const validBody = {
      serverUrl: 'my-instance.salesforce.com',
      accessToken: 'test-access-token',
    };

    it('should return agents on successful SOQL query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            totalSize: 2,
            records: [
              { Id: 'agent-1', DeveloperName: 'MyAgent', MasterLabel: 'My Agent' },
              { Id: 'agent-2', DeveloperName: 'OtherAgent', MasterLabel: 'Other Agent' },
            ],
          }),
      });

      const res = await request(app).post('/discover-agents').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agents).toHaveLength(2);
      expect(res.body.agents[0]).toEqual({
        id: 'agent-1',
        developerName: 'MyAgent',
        label: 'My Agent',
      });
      expect(res.body.totalSize).toBe(2);
      expect(res.body.latencyMs).toBeTypeOf('number');
    });

    it('should return empty list when no agents found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalSize: 0, records: [] }),
      });

      const res = await request(app).post('/discover-agents').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agents).toEqual([]);
      expect(res.body.totalSize).toBe(0);
    });

    it('should return failure when SOQL query fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('INVALID_SESSION_ID'),
      });

      const res = await request(app).post('/discover-agents').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('SOQL query failed');
      expect(res.body.agents).toEqual([]);
    });

    it('should return failure when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const res = await request(app).post('/discover-agents').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Network error');
    });

    it('should return 400 when required fields are missing', async () => {
      const res1 = await request(app).post('/discover-agents').send({});
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/discover-agents')
        .send({ serverUrl: 'x' }); // missing accessToken
      expect(res2.status).toBe(400);
    });

    it('should construct correct SOQL URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalSize: 0, records: [] }),
      });

      await request(app).post('/discover-agents').send(validBody);

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://my-instance.salesforce.com/services/data/v62.0/query/');
      expect(calledUrl).toContain('BotDefinition');
      expect(calledUrl).toContain('IsActive');
    });
  });

  // ─── Test Session ──────────────────────────────────────────────────

  describe('POST /test-session', () => {
    const validBody = {
      accessToken: 'test-access-token',
      instanceUrl: 'https://my-instance.salesforce.com',
      agentId: 'agent-123',
    };

    it('should return success when session create + delete succeeds', async () => {
      sessionCreateImpl = async () => 'session-abc';
      sessionDeleteImpl = async () => {};

      const res = await request(app).post('/test-session').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toBe('session-abc');
      expect(res.body.latencyMs).toBeTypeOf('number');
      expect(res.body.message).toContain('created and cleaned up');

      // Verify session was created then deleted
      expect(sessionCreateCalls[0]).toEqual([
        'test-access-token',
        'https://my-instance.salesforce.com',
        'agent-123',
      ]);
      expect(sessionDeleteCalls[0]).toEqual(['test-access-token', 'session-abc']);
    });

    it('should return failure when session creation fails', async () => {
      sessionCreateImpl = async () => {
        throw new Error('Agent not found');
      };

      const res = await request(app).post('/test-session').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Agent not found');
    });

    it('should return failure when session deletion fails', async () => {
      sessionCreateImpl = async () => 'session-abc';
      sessionDeleteImpl = async () => {
        throw new Error('Delete failed');
      };

      const res = await request(app).post('/test-session').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Delete failed');
    });

    it('should return 400 when required fields are missing', async () => {
      const res1 = await request(app).post('/test-session').send({});
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/test-session')
        .send({ accessToken: 'x', instanceUrl: 'y' }); // missing agentId
      expect(res2.status).toBe(400);
    });
  });

  // ─── Test Message ──────────────────────────────────────────────────

  describe('POST /test-message', () => {
    const validBody = {
      accessToken: 'test-access-token',
      instanceUrl: 'https://my-instance.salesforce.com',
      agentId: 'agent-123',
    };

    it('should return agent response on success', async () => {
      sessionCreateImpl = async () => 'session-xyz';
      messagingSendImpl = async () => ({
        text: 'Hello! I am an AI assistant.',
        raw: {},
      });
      sessionDeleteImpl = async () => {};

      const res = await request(app).post('/test-message').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response).toBe('Hello! I am an AI assistant.');
      expect(res.body.sessionId).toBe('session-xyz');
      expect(res.body.latencyMs).toBeTypeOf('number');
    });

    it('should use default test message when none provided', async () => {
      sessionCreateImpl = async () => 'session-xyz';
      messagingSendImpl = async () => ({ text: 'Response', raw: {} });
      sessionDeleteImpl = async () => {};

      await request(app).post('/test-message').send(validBody);

      // The default message is sent as the 4th argument to messaging.send()
      expect(messagingSendCalls).toHaveLength(1);
      const sentText = messagingSendCalls[0][3] as string;
      expect(sentText).toContain('test message');
    });

    it('should use custom test message when provided', async () => {
      sessionCreateImpl = async () => 'session-xyz';
      messagingSendImpl = async () => ({ text: 'Response', raw: {} });
      sessionDeleteImpl = async () => {};

      await request(app)
        .post('/test-message')
        .send({ ...validBody, testMessage: 'Who are you?' });

      expect(messagingSendCalls).toHaveLength(1);
      const sentText = messagingSendCalls[0][3] as string;
      expect(sentText).toBe('Who are you?');
    });

    it('should return failure when session creation fails', async () => {
      sessionCreateImpl = async () => {
        throw new Error('Session error');
      };

      const res = await request(app).post('/test-message').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Session error');
    });

    it('should return failure when messaging fails', async () => {
      sessionCreateImpl = async () => 'session-xyz';
      messagingSendImpl = async () => {
        throw new Error('Timeout');
      };

      const res = await request(app).post('/test-message').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Timeout');
    });

    it('should still succeed if session cleanup fails', async () => {
      sessionCreateImpl = async () => 'session-xyz';
      messagingSendImpl = async () => ({ text: 'Response', raw: {} });
      sessionDeleteImpl = async () => {
        throw new Error('Cleanup failed');
      };

      const res = await request(app).post('/test-message').send(validBody);

      // test-message catches session.delete errors via .catch(() => {}), so this should still succeed
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response).toBe('Response');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app).post('/test-message').send({});
      expect(res.status).toBe(400);
    });
  });

  // ─── Verify Proxy ──────────────────────────────────────────────────

  describe('GET /verify-proxy', () => {
    it('should report healthy when all env vars are set', async () => {
      process.env.SALESFORCE_SERVER_URL = 'login.salesforce.com';
      process.env.SALESFORCE_CLIENT_ID = 'my-client-id-12345';
      process.env.SALESFORCE_CLIENT_SECRET = 'secret-value';
      process.env.SALESFORCE_AGENT_ID = 'agent-id-12345';
      process.env.SALESFORCE_CLIENT_EMAIL = 'agent@example.com';
      process.env.BASE_URL = 'https://my-proxy.herokuapp.com';
      process.env.API_KEY = 'test-api-key';

      const res = await request(app).get('/verify-proxy');

      expect(res.status).toBe(200);
      expect(res.body.healthy).toBe(true);
      expect(res.body.issues).toEqual([]);
      expect(res.body.timestamp).toBeDefined();
    });

    it('should report unhealthy when env vars are missing', async () => {
      delete process.env.SALESFORCE_SERVER_URL;
      delete process.env.SALESFORCE_CLIENT_ID;
      delete process.env.SALESFORCE_CLIENT_SECRET;
      delete process.env.SALESFORCE_AGENT_ID;
      delete process.env.SALESFORCE_CLIENT_EMAIL;
      delete process.env.BASE_URL;
      delete process.env.API_KEY;

      const res = await request(app).get('/verify-proxy');

      expect(res.status).toBe(200);
      expect(res.body.healthy).toBe(false);
      expect(res.body.issues).toContain('SALESFORCE_SERVER_URL is not set');
      expect(res.body.issues).toContain('API_KEY is not set');
      expect(res.body.issues.length).toBe(7);
    });

    it('should mask values showing first 4 chars', async () => {
      process.env.SALESFORCE_SERVER_URL = 'login.salesforce.com';
      process.env.SALESFORCE_CLIENT_ID = 'my-client-id-12345';
      process.env.SALESFORCE_CLIENT_SECRET = 'super-secret';
      process.env.SALESFORCE_AGENT_ID = 'agent-id-12345';
      process.env.SALESFORCE_CLIENT_EMAIL = 'agent@example.com';
      process.env.BASE_URL = 'https://proxy.herokuapp.com';
      process.env.API_KEY = 'test-api-key';

      const res = await request(app).get('/verify-proxy');

      // maskValue shows first 4 chars + ***
      expect(res.body.config.salesforceServerUrl).toBe('logi***');
      expect(res.body.config.salesforceClientId).toBe('my-c***');
      // maskPresence shows only set/not set
      expect(res.body.config.salesforceClientSecret).toBe('set');
      expect(res.body.config.apiKey).toBe('set');
    });

    it('should show "not set" for missing values', async () => {
      delete process.env.SALESFORCE_SERVER_URL;
      delete process.env.SALESFORCE_CLIENT_SECRET;
      delete process.env.API_KEY;
      delete process.env.DELEGATE_API_KEY;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_TLS_URL;

      const res = await request(app).get('/verify-proxy');

      expect(res.body.config.salesforceServerUrl).toBe('not set');
      expect(res.body.config.salesforceClientSecret).toBe('not set');
      expect(res.body.config.apiKey).toBe('not set');
      expect(res.body.config.delegateApiKey).toBe('not set');
      expect(res.body.config.redisUrl).toBe('not set');
    });

    it('should mask short values completely', async () => {
      process.env.SALESFORCE_SERVER_URL = 'short';  // 5 chars, <= 6

      const res = await request(app).get('/verify-proxy');

      // Values with length <= 6 should be fully masked
      expect(res.body.config.salesforceServerUrl).toBe('***');
    });

    it('should report partial configuration issues', async () => {
      process.env.SALESFORCE_SERVER_URL = 'login.salesforce.com';
      process.env.SALESFORCE_CLIENT_ID = 'my-client-id';
      process.env.SALESFORCE_CLIENT_SECRET = 'secret';
      delete process.env.SALESFORCE_AGENT_ID;
      delete process.env.SALESFORCE_CLIENT_EMAIL;
      process.env.BASE_URL = 'https://proxy.example.com';
      process.env.API_KEY = 'key';

      const res = await request(app).get('/verify-proxy');

      expect(res.body.healthy).toBe(false);
      expect(res.body.issues).toHaveLength(2);
      expect(res.body.issues).toContain('SALESFORCE_AGENT_ID is not set');
      expect(res.body.issues).toContain('SALESFORCE_CLIENT_EMAIL is not set');
    });
  });
});
