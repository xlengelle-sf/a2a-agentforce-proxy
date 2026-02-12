import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import { healthHandler } from './shared/health.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { requestLogger } from './shared/middleware/request-logger.js';
import { createA2ARouter } from './a2a/server/index.js';
import { createDelegateRouter } from './agentforce/action-endpoint/index.js';
import { createDashboardRouter } from './dashboard/routes.js';
import { ConversationEventStore } from './dashboard/event-store.js';
import type { JsonRpcHandlerDeps } from './a2a/server/jsonrpc-handler.js';
import type { DelegateHandlerDeps } from './agentforce/action-endpoint/delegate.js';

export interface AppDeps {
  a2a?: JsonRpcHandlerDeps;
  delegate?: DelegateHandlerDeps;
  /** Set to false to skip dashboard setup (e.g. in API-only tests). */
  enableDashboard?: boolean;
}

// ─── Rate Limiters ──────────────────────────────────────────────────────────

const a2aRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_A2A ?? '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const delegateRateLimit = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_DELEGATE ?? '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ─── CORS Configuration ─────────────────────────────────────────────────────

function buildCorsOptions(): cors.CorsOptions {
  const allowedOrigins = process.env.CORS_ORIGINS;
  if (!allowedOrigins || allowedOrigins === '*') {
    return {}; // Allow all origins
  }
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  return { origin: origins };
}

// ─── Resolve public/ directory path ──────────────────────────────────────────

function getPublicDir(): string {
  // Works in both ESM and compiled output
  const currentFile = fileURLToPath(import.meta.url);
  const srcDir = path.dirname(currentFile);
  const projectRoot = path.dirname(srcDir);
  return path.join(projectRoot, 'public');
}

/**
 * Create the Express app with security middleware.
 * When called without deps (e.g. in health-check tests), both routers are skipped.
 */
export function createApp(deps?: AppDeps): express.Express {
  const app = express();

  // CORS (before helmet so preflight works)
  app.use(cors(buildCorsOptions()));

  // Request logging
  app.use(requestLogger);

  // ── Dashboard routes (relaxed CSP, no API rate limits) ────────────────
  const shouldEnableDashboard = deps?.enableDashboard !== false;

  if (shouldEnableDashboard) {
    const publicDir = getPublicDir();

    // Relaxed helmet for dashboard: allow self scripts/styles
    const dashboardHelmet = helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // CSS in dashboard
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    });

    // Serve static files (CSS, JS) — no auth required for these
    app.use('/css', dashboardHelmet, express.static(path.join(publicDir, 'css')));
    app.use('/js', dashboardHelmet, express.static(path.join(publicDir, 'js')));

    // Dashboard routes need form-urlencoded + JSON parsing
    const eventStore = new ConversationEventStore();

    const dashboardRouter = createDashboardRouter({
      eventStore,
      publicDir,
    });

    // Mount with relaxed helmet + form body parser
    app.use(
      '/dashboard',
      dashboardHelmet,
      express.urlencoded({ extended: false }),
      express.json({ limit: '1mb' }),
      dashboardRouter,
    );
  }

  // ── API routes (strict helmet, rate limits) ───────────────────────────

  // Strict security headers for API endpoints
  app.use(helmet());

  // JSON body parser with size limit
  app.use(express.json({ limit: '1mb' }));

  // Health check (no rate limiting, no auth)
  app.get('/health', healthHandler);

  // A2A inbound routes (when deps are provided)
  if (deps?.a2a) {
    app.use(a2aRateLimit, createA2ARouter(deps.a2a));
  }

  // Delegate outbound routes (when deps are provided)
  if (deps?.delegate) {
    app.use(delegateRateLimit, createDelegateRouter(deps.delegate));
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
