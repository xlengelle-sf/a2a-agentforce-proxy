import { Router } from 'express';
import { agentCardHandler } from './agent-card.js';
import { createJsonRpcHandler, type JsonRpcHandlerDeps } from './jsonrpc-handler.js';
import { bearerAuth } from '../../shared/middleware/auth.js';

export function createA2ARouter(deps: JsonRpcHandlerDeps): Router {
  const router = Router();

  // Agent Card — public, no auth
  router.get('/.well-known/agent-card.json', agentCardHandler);

  // JSON-RPC endpoint — requires bearer auth
  router.post('/a2a', bearerAuth, createJsonRpcHandler(deps));

  return router;
}
