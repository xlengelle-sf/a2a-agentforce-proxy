import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDashboardRouter } from '../../src/dashboard/routes.js';
import { ConversationEventStore } from '../../src/dashboard/event-store.js';
import { getEventBus, resetEventBus } from '../../src/dashboard/event-bus.js';
import { parseSSEEvents } from '../../src/shared/sse.js';
import { _signToken } from '../../src/dashboard/auth.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_PUBLIC_DIR = path.resolve(__dirname, '../../public');

function buildApp(eventStore?: ConversationEventStore) {
  const app = express();
  const store = eventStore ?? new ConversationEventStore(100);
  const publicDir = PROJECT_PUBLIC_DIR;

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Static files (mimic app.ts setup)
  app.use('/css', express.static(`${publicDir}/css`));
  app.use('/js', express.static(`${publicDir}/js`));

  app.use('/dashboard', createDashboardRouter({ eventStore: store, publicDir }));

  return { app, store };
}

function validCookie(): string {
  const token = _signToken({ user: 'testuser', exp: Date.now() + 60_000 });
  return `dashboard_session=${token}`;
}

function expiredCookie(): string {
  const token = _signToken({ user: 'testuser', exp: Date.now() - 1000 });
  return `dashboard_session=${token}`;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Dashboard Integration Flow', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEventBus();
    process.env.DASHBOARD_USER = 'testuser';
    process.env.DASHBOARD_PASS = 'testpass';
    process.env.API_KEY = 'test-api-key-for-cookie-signing';
  });

  afterEach(() => {
    resetEventBus();
    process.env = { ...originalEnv };
  });

  // ── Login Flow ──────────────────────────────────────────────────────────

  describe('Login → Dashboard → Logout flow', () => {
    it('should serve the login page', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/dashboard/login');
      expect(res.status).toBe(200);
      expect(res.text).toContain('A2A Proxy');
      expect(res.text).toContain('login-form');
    });

    it('should login with valid credentials and return a session cookie', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post('/dashboard/login')
        .send({ username: 'testuser', password: 'testpass' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.redirect).toBe('/dashboard');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('dashboard_session=');
    });

    it('should reject invalid credentials', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post('/dashboard/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should serve dashboard.html when authenticated', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/dashboard')
        .set('Cookie', validCookie());

      expect(res.status).toBe(200);
      expect(res.text).toContain('Conversations');
      expect(res.text).toContain('Setup Wizard');
      expect(res.text).toContain('monitor.js');
    });

    it('should redirect unauthenticated HTML requests to login', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/dashboard')
        .set('Accept', 'text/html');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard/login');
    });

    it('should return 401 for unauthenticated API requests', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/dashboard/api/status')
        .set('Accept', 'application/json');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should reject expired cookies', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/dashboard/api/status')
        .set('Cookie', expiredCookie());

      expect(res.status).toBe(401);
    });

    it('should logout and clear the cookie', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post('/dashboard/logout')
        .set('Cookie', validCookie());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie'][0]).toContain('Max-Age=0');
    });
  });

  // ── Status API ──────────────────────────────────────────────────────────

  describe('Status API', () => {
    it('should return event store status', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/dashboard/api/status')
        .set('Cookie', validCookie());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('eventCount');
      expect(res.body).toHaveProperty('oldestEvent');
      expect(res.body).toHaveProperty('bufferCapacity');
    });

    it('should reflect events in event count', async () => {
      const { app, store } = buildApp();

      // Emit some events
      const bus = getEventBus();
      bus.emitConversation({
        direction: 'inbound',
        source: 'Agent A',
        target: 'Agent B',
        taskId: 'task-1',
        contextId: 'ctx-1',
        messageType: 'request',
        content: 'Hello',
      });

      const res = await request(app)
        .get('/dashboard/api/status')
        .set('Cookie', validCookie());

      expect(res.status).toBe(200);
      expect(res.body.eventCount).toBe(1);
    });
  });

  // ── SSE Events Endpoint ─────────────────────────────────────────────────

  describe('SSE Events Endpoint', () => {
    it('should send history events on connect', async () => {
      const { app } = buildApp();

      // Emit some events before connecting
      const bus = getEventBus();
      bus.emitConversation({
        direction: 'inbound',
        source: 'Agent A',
        target: 'Agent B',
        taskId: 'task-1',
        contextId: 'ctx-1',
        messageType: 'request',
        content: 'Hello from history',
      });
      bus.emitConversation({
        direction: 'inbound',
        source: 'Agent B',
        target: 'Agent A',
        taskId: 'task-1',
        contextId: 'ctx-1',
        messageType: 'response',
        content: 'History response',
        latencyMs: 150,
      });

      // Connect to SSE endpoint and collect data
      const sseData = await collectSSE(app, '/dashboard/events', validCookie(), 300);

      // Parse SSE events
      const events = parseSSEEvents(sseData);
      const historyEvent = events.find((e) => e.event === 'history');

      expect(historyEvent).toBeDefined();
      const history = JSON.parse(historyEvent!.data);
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Hello from history');
      expect(history[1].content).toBe('History response');
      expect(history[1].latencyMs).toBe(150);
    });

    it('should stream live events in real time', async () => {
      const { app } = buildApp();

      // Start SSE connection
      const ssePromise = collectSSE(app, '/dashboard/events', validCookie(), 500);

      // Wait a tick then emit a live event
      await new Promise((r) => setTimeout(r, 100));
      const bus = getEventBus();
      bus.emitConversation({
        direction: 'outbound',
        source: 'Agentforce',
        target: 'External Agent',
        taskId: 'task-live',
        contextId: 'ctx-live',
        messageType: 'request',
        content: 'Live message!',
        metadata: { streaming: true },
      });

      const sseData = await ssePromise;
      const events = parseSSEEvents(sseData);
      const liveEvent = events.find((e) => e.event === 'conversation');

      expect(liveEvent).toBeDefined();
      const parsed = JSON.parse(liveEvent!.data);
      expect(parsed.content).toBe('Live message!');
      expect(parsed.direction).toBe('outbound');
      expect(parsed.metadata).toEqual({ streaming: true });
    });

    it('should require authentication for SSE endpoint', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/dashboard/events')
        .set('Accept', 'text/event-stream');

      expect(res.status).toBe(401);
    });

    it('should send both history and live events', async () => {
      const { app } = buildApp();

      // Pre-populate history
      const bus = getEventBus();
      bus.emitConversation({
        direction: 'inbound',
        source: 'A',
        target: 'B',
        taskId: 't1',
        contextId: 'c1',
        messageType: 'request',
        content: 'history msg',
      });

      // Start SSE and emit live after a tick
      const ssePromise = collectSSE(app, '/dashboard/events', validCookie(), 500);

      await new Promise((r) => setTimeout(r, 100));
      bus.emitConversation({
        direction: 'outbound',
        source: 'B',
        target: 'A',
        taskId: 't2',
        contextId: 'c2',
        messageType: 'response',
        content: 'live msg',
        latencyMs: 200,
      });

      const sseData = await ssePromise;
      const events = parseSSEEvents(sseData);

      const historyEvents = events.filter((e) => e.event === 'history');
      const conversationEvents = events.filter((e) => e.event === 'conversation');

      expect(historyEvents.length).toBeGreaterThanOrEqual(1);
      expect(conversationEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should not send history when store is empty', async () => {
      const { app } = buildApp();

      const sseData = await collectSSE(app, '/dashboard/events', validCookie(), 200);
      const events = parseSSEEvents(sseData);
      const historyEvent = events.find((e) => e.event === 'history');

      expect(historyEvent).toBeUndefined();
    });
  });

  // ── Static Files ────────────────────────────────────────────────────────

  describe('Static files', () => {
    it('should serve dashboard.css', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/css/dashboard.css');
      expect(res.status).toBe(200);
      expect(res.text).toContain('bubble');
    });

    it('should serve monitor.js', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/js/monitor.js');
      expect(res.status).toBe(200);
      expect(res.text).toContain('EventSource');
    });

    it('should serve auth.js', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/js/auth.js');
      expect(res.status).toBe(200);
      expect(res.text).toContain('login');
    });
  });

  // ── Event Bus → Store → SSE Integration ─────────────────────────────────

  describe('Event pipeline: Bus → Store → SSE', () => {
    it('should preserve all event fields through the pipeline', async () => {
      const { app } = buildApp();

      const bus = getEventBus();
      const emitted = bus.emitConversation({
        direction: 'inbound',
        source: 'External A2A Agent',
        target: 'Agentforce',
        taskId: 'task-pipeline',
        contextId: 'ctx-pipeline',
        messageType: 'request',
        content: 'Pipeline test message',
        latencyMs: 42,
        metadata: { streaming: false, custom: 'data' },
      });

      const sseData = await collectSSE(app, '/dashboard/events', validCookie(), 200);
      const events = parseSSEEvents(sseData);
      const historyEvent = events.find((e) => e.event === 'history');

      expect(historyEvent).toBeDefined();
      const history = JSON.parse(historyEvent!.data);
      expect(history).toHaveLength(1);

      const received = history[0];
      expect(received.id).toBe(emitted.id);
      expect(received.timestamp).toBe(emitted.timestamp);
      expect(received.direction).toBe('inbound');
      expect(received.source).toBe('External A2A Agent');
      expect(received.target).toBe('Agentforce');
      expect(received.taskId).toBe('task-pipeline');
      expect(received.contextId).toBe('ctx-pipeline');
      expect(received.messageType).toBe('request');
      expect(received.content).toBe('Pipeline test message');
      expect(received.latencyMs).toBe(42);
      expect(received.metadata).toEqual({ streaming: false, custom: 'data' });
    });

    it('should handle multiple conversations with different contextIds', async () => {
      const { app } = buildApp();

      const bus = getEventBus();

      // Conversation 1
      bus.emitConversation({
        direction: 'inbound',
        source: 'Agent A',
        target: 'Agentforce',
        taskId: 't1',
        contextId: 'ctx-alpha',
        messageType: 'request',
        content: 'Alpha request',
      });
      bus.emitConversation({
        direction: 'inbound',
        source: 'Agentforce',
        target: 'Agent A',
        taskId: 't1',
        contextId: 'ctx-alpha',
        messageType: 'response',
        content: 'Alpha response',
        latencyMs: 100,
      });

      // Conversation 2
      bus.emitConversation({
        direction: 'outbound',
        source: 'Agentforce',
        target: 'Agent B',
        taskId: 't2',
        contextId: 'ctx-beta',
        messageType: 'request',
        content: 'Beta request',
      });

      const sseData = await collectSSE(app, '/dashboard/events', validCookie(), 200);
      const events = parseSSEEvents(sseData);
      const historyEvent = events.find((e) => e.event === 'history');

      expect(historyEvent).toBeDefined();
      const history = JSON.parse(historyEvent!.data);
      expect(history).toHaveLength(3);

      // Verify different contextIds are preserved
      const contextIds = new Set(history.map((e: { contextId: string }) => e.contextId));
      expect(contextIds.size).toBe(2);
      expect(contextIds.has('ctx-alpha')).toBe(true);
      expect(contextIds.has('ctx-beta')).toBe(true);
    });

    it('should handle store capacity overflow gracefully', async () => {
      // Create store with very small capacity
      const store = new ConversationEventStore(3);
      const app = express();
      app.use(express.json());
      app.use('/dashboard', createDashboardRouter({ eventStore: store, publicDir: PROJECT_PUBLIC_DIR }));

      const bus = getEventBus();

      // Emit 5 events (overflow capacity of 3)
      for (let i = 0; i < 5; i++) {
        bus.emitConversation({
          direction: 'inbound',
          source: 'A',
          target: 'B',
          taskId: `t-${i}`,
          contextId: `c-${i}`,
          messageType: 'request',
          content: `Message ${i}`,
        });
      }

      const sseData = await collectSSE(app, '/dashboard/events', validCookie(), 200);
      const events = parseSSEEvents(sseData);
      const historyEvent = events.find((e) => e.event === 'history');

      expect(historyEvent).toBeDefined();
      const history = JSON.parse(historyEvent!.data);

      // Only 3 most recent should be preserved
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('Message 2');
      expect(history[1].content).toBe('Message 3');
      expect(history[2].content).toBe('Message 4');
    });
  });

  // ── Full Login → Monitor → Logout Journey ──────────────────────────────

  describe('Full user journey', () => {
    it('should complete: login → view dashboard → see events → logout', async () => {
      const { app } = buildApp();

      // 1. Login
      const loginRes = await request(app)
        .post('/dashboard/login')
        .send({ username: 'testuser', password: 'testpass' });

      expect(loginRes.status).toBe(200);
      const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

      // 2. Access dashboard
      const dashRes = await request(app)
        .get('/dashboard')
        .set('Cookie', cookie);

      expect(dashRes.status).toBe(200);
      expect(dashRes.text).toContain('Conversations');

      // 3. Check status
      const statusRes = await request(app)
        .get('/dashboard/api/status')
        .set('Cookie', cookie);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.eventCount).toBe(0);

      // 4. Emit an event
      const bus = getEventBus();
      bus.emitConversation({
        direction: 'inbound',
        source: 'Agent X',
        target: 'Agentforce',
        taskId: 'journey-task',
        contextId: 'journey-ctx',
        messageType: 'request',
        content: 'Journey test',
      });

      // 5. Check updated status
      const statusRes2 = await request(app)
        .get('/dashboard/api/status')
        .set('Cookie', cookie);

      expect(statusRes2.body.eventCount).toBe(1);

      // 6. Logout
      const logoutRes = await request(app)
        .post('/dashboard/logout')
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);

      // 7. Confirm access is denied after logout (cookie was cleared server-side)
      const afterLogout = await request(app)
        .get('/dashboard/api/status')
        .set('Cookie', cookie.replace(/=.*/, '='));  // simulate cleared cookie

      expect(afterLogout.status).toBe(401);
    });
  });
});

// ─── SSE Collection Helper ───────────────────────────────────────────────────

/**
 * Open an SSE connection, collect data for `durationMs`, then abort.
 */
function collectSSE(
  app: express.Express,
  path: string,
  cookie: string,
  durationMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }

      const port = addr.port;
      let data = '';

      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path,
          headers: {
            Cookie: cookie,
            Accept: 'text/event-stream',
          },
        },
        (res) => {
          res.setEncoding('utf-8');
          res.on('data', (chunk: string) => {
            data += chunk;
          });
        },
      );

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      setTimeout(() => {
        req.destroy();
        server.close(() => resolve(data));
      }, durationMs);
    });
  });
}
