import { AgentCardResolver } from './agent-card-resolver.js';
import { A2AClient } from './a2a-client.js';

export { AgentCardResolver } from './agent-card-resolver.js';
export { A2AClient } from './a2a-client.js';
export type { A2AClientOptions, SendMessageOptions } from './a2a-client.js';

/**
 * Factory function to create an A2A client with default configuration.
 */
export function createA2AClient(opts?: {
  cardTtlMs?: number;
  timeoutMs?: number;
}): A2AClient {
  const resolver = new AgentCardResolver({ ttlMs: opts?.cardTtlMs });
  return new A2AClient(resolver, { timeoutMs: opts?.timeoutMs });
}
