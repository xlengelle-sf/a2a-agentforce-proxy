/**
 * Dashboard Express router.
 *
 * Handles:
 *   - Login / Logout
 *   - Main dashboard page (auth required)
 *   - SSE events endpoint (auth required)
 *   - Setup wizard API (auth required) — Block 11
 *   - Status API (auth required)
 */

import { Router } from 'express';
import path from 'node:path';
import type { Request, Response } from 'express';
import { handleLogin, handleLogout, dashboardAuth } from './auth.js';
import { getEventBus, type ConversationEvent } from './event-bus.js';
import { formatSSE, setSSEHeaders, startHeartbeat } from '../shared/sse.js';
import {
  handleTestOAuth,
  handleDiscoverAgents,
  handleTestSession,
  handleTestMessage,
  handleVerifyProxy,
  handleRevealApiKey,
} from './setup-wizard.js';
import { logger } from '../shared/logger.js';
import type { ConversationEventStore } from './event-store.js';
import type { AgentRegistry } from '../config/agent-registry.js';
import { getConfig } from '../config/config-manager.js';

export interface DashboardDeps {
  eventStore: ConversationEventStore;
  publicDir: string; // Absolute path to public/ directory
  agentRegistry?: AgentRegistry;
}

export function createDashboardRouter(deps: DashboardDeps): Router {
  const router = Router();

  // ── Public routes (no auth) ────────────────────────────────────────────

  // Serve login page
  router.get('/login', (_req, res) => {
    res.sendFile(path.join(deps.publicDir, 'login.html'));
  });

  // Handle login form submission
  router.post('/login', handleLogin);

  // ── Auth-protected routes ──────────────────────────────────────────────

  // All routes below require valid dashboard session
  router.use(dashboardAuth);

  // Handle logout
  router.post('/logout', handleLogout);

  // Serve main dashboard page
  router.get('/', (_req, res) => {
    res.sendFile(path.join(deps.publicDir, 'dashboard.html'));
  });

  // Status API
  router.get('/api/status', (_req, res) => {
    res.json({
      eventCount: deps.eventStore.size,
      oldestEvent: deps.eventStore.oldestTimestamp,
      bufferCapacity: parseInt(process.env.DASHBOARD_EVENT_BUFFER_SIZE ?? '500', 10),
    });
  });

  // ── SSE Events endpoint ───────────────────────────────────────────────

  router.get('/events', (req: Request, res: Response) => {
    setSSEHeaders(res);

    // Send stored history as initial batch
    const history = deps.eventStore.getAll();
    if (history.length > 0) {
      res.write(formatSSE('history', history));
    }

    // Start heartbeat
    const stopHeartbeat = startHeartbeat(res);

    // Subscribe to live events
    const bus = getEventBus();
    const onEvent = (event: ConversationEvent) => {
      try {
        res.write(formatSSE('conversation', event));
      } catch {
        // Client likely disconnected
      }
    };

    bus.on('conversation', onEvent);

    // Clean up on disconnect
    req.on('close', () => {
      bus.off('conversation', onEvent);
      stopHeartbeat();
      logger.debug('Dashboard SSE client disconnected');
    });
  });

  // ── Setup Wizard API ─────────────────────────────────────────────────────

  router.post('/api/setup/test-oauth', handleTestOAuth);
  router.post('/api/setup/discover-agents', handleDiscoverAgents);
  router.post('/api/setup/test-session', handleTestSession);
  router.post('/api/setup/test-message', handleTestMessage);
  router.get('/api/setup/verify-proxy', handleVerifyProxy);
  router.get('/api/setup/reveal-api-key', handleRevealApiKey);

  // ── Agent Management API ───────────────────────────────────────────────────

  // GET /dashboard/api/agents/agentforce — returns Agentforce config from env
  router.get('/api/agents/agentforce', (_req: Request, res: Response) => {
    const config = getConfig();
    res.json({
      agents: [
        {
          id: 'agentforce-primary',
          agentId: config.salesforce.agentId,
          serverUrl: config.salesforce.serverUrl,
          clientEmail: config.salesforce.clientEmail,
          clientId: config.salesforce.clientId,
          hasClientSecret: !!config.salesforce.clientSecret,
        },
      ],
    });
  });

  // GET /dashboard/api/agents/external — list all external A2A agents
  router.get('/api/agents/external', (_req: Request, res: Response) => {
    if (!deps.agentRegistry) {
      return res.json({ agents: [] });
    }
    // Return agents without exposing actual auth tokens
    const agents = deps.agentRegistry.listAgents().map((a) => ({
      alias: a.alias,
      url: a.url,
      description: a.description ?? '',
      authType: a.authType,
      authToken: a.authToken ?? '',
      authHeader: a.authHeader ?? '',
    }));
    res.json({ agents });
  });

  // POST /dashboard/api/agents/external — add a new external agent
  router.post('/api/agents/external', (req: Request, res: Response) => {
    if (!deps.agentRegistry) {
      return res.status(500).json({ error: 'Agent registry not available' });
    }
    try {
      const { alias, url, description, authType, authToken, authHeader } = req.body;
      if (!alias || !url || !authType) {
        return res.status(400).json({ error: 'alias, url, and authType are required' });
      }
      deps.agentRegistry.addAgent({
        alias,
        url,
        description: description ?? '',
        authType,
        authToken: authToken ?? '',
        authHeader: authHeader ?? '',
      });
      res.json({ ok: true });
    } catch (err: any) {
      logger.warn({ err }, 'Failed to add external agent');
      res.status(400).json({ error: err.message ?? 'Failed to add agent' });
    }
  });

  // PUT /dashboard/api/agents/external/:alias — update an external agent
  router.put('/api/agents/external/:alias', (req: Request, res: Response) => {
    if (!deps.agentRegistry) {
      return res.status(500).json({ error: 'Agent registry not available' });
    }
    try {
      const alias = req.params.alias as string;
      const { url, description, authType, authToken, authHeader } = req.body;
      const updated = deps.agentRegistry.updateAgent(alias, {
        url,
        description,
        authType,
        authToken,
        authHeader,
      });
      res.json({ ok: true, agent: updated });
    } catch (err: any) {
      logger.warn({ err }, 'Failed to update external agent');
      res.status(400).json({ error: err.message ?? 'Failed to update agent' });
    }
  });

  // DELETE /dashboard/api/agents/external/:alias — delete an external agent
  router.delete('/api/agents/external/:alias', (req: Request, res: Response) => {
    if (!deps.agentRegistry) {
      return res.status(500).json({ error: 'Agent registry not available' });
    }
    try {
      deps.agentRegistry.deleteAgent(req.params.alias as string);
      res.json({ ok: true });
    } catch (err: any) {
      logger.warn({ err }, 'Failed to delete external agent');
      res.status(400).json({ error: err.message ?? 'Failed to delete agent' });
    }
  });

  return router;
}
