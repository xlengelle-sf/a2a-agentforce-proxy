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

export interface DashboardDeps {
  eventStore: ConversationEventStore;
  publicDir: string; // Absolute path to public/ directory
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

  return router;
}
