import { Router } from 'express';
import { delegateAuth } from '../../shared/middleware/delegate-auth.js';
import {
  createDelegateHandler,
  createListAgentsHandler,
  createDiscoverAgentHandler,
} from './delegate.js';
import type { DelegateHandlerDeps } from './delegate.js';

export type { DelegateHandlerDeps } from './delegate.js';

/**
 * Create the delegate router for Agentforce → A2A direction.
 *
 * Routes:
 *   POST  /api/v1/delegate              — Send message to external A2A agent
 *   POST  /api/v1/agents                — List configured external agents (with optional filter)
 *   POST  /api/v1/agents/:alias/discover — Fetch fresh Agent Card for an agent
 */
export function createDelegateRouter(deps: DelegateHandlerDeps): Router {
  const router = Router();

  router.post('/api/v1/delegate', delegateAuth, createDelegateHandler(deps));
  router.post('/api/v1/agents', delegateAuth, createListAgentsHandler(deps));
  router.post('/api/v1/agents/:alias/discover', delegateAuth, createDiscoverAgentHandler(deps));

  return router;
}
