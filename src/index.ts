import dotenv from 'dotenv';
dotenv.config();

import { logger } from './shared/logger.js';
import { validateEnv } from './config/env-validator.js';
import { getConfig } from './config/config-manager.js';
import { setRedisStatus } from './shared/health.js';
import { createApp } from './app.js';
import { AgentRegistry } from './config/agent-registry.js';
import { AgentCardResolver } from './a2a/client/agent-card-resolver.js';
import { A2AClient } from './a2a/client/a2a-client.js';
import { MemoryStore } from './session/memory-store.js';
import { SessionManager } from './session/session-manager.js';

// ─── Unhandled Rejection Handler ─────────────────────────────────────────────
// Log but do NOT crash — Heroku would restart and lose all in-flight requests.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

// ─── Startup ────────────────────────────────────────────────────────────────

validateEnv();

const config = getConfig();

// ─── Wire delegate dependencies ─────────────────────────────────────────────

const agentRegistry = new AgentRegistry();
const cardResolver = new AgentCardResolver();
const a2aClient = new A2AClient(cardResolver);
const sessionStore = new MemoryStore();
const sessionManager = new SessionManager(sessionStore, {
  ttlSeconds: config.sessionTtlSeconds,
});
sessionManager.startCleanupInterval();

const app = createApp({
  delegate: {
    a2aClient,
    agentRegistry,
    sessionManager,
    tenantId: 'proxy',
  },
});

// Redis health status (set when store is initialized in production wiring)
if (config.redisUrl || config.redisTlsUrl) {
  setRedisStatus('disconnected'); // Will be updated when Redis connects
} else {
  setRedisStatus('not configured');
}

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    'A2A Agentforce Proxy started',
  );
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Give in-flight requests time to finish
  const forceExit = setTimeout(() => {
    logger.warn('Forceful shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't keep process alive just for the timer
  forceExit.unref();

  // Close Redis if available (imported dynamically to avoid circular deps)
  try {
    // If Redis store is used, it would export a close method.
    // For now, just wait for server to drain.
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
