import { logger } from '../shared/logger.js';
import type { SessionStore } from './store.js';
import { MemoryStore } from './memory-store.js';
import { RedisStore } from './redis-store.js';

export { SessionManager } from './session-manager.js';
export { MemoryStore } from './memory-store.js';
export { RedisStore } from './redis-store.js';
export type { SessionMapping, SessionStore } from './store.js';

/** Create the appropriate session store based on environment. */
export function createSessionStore(): SessionStore {
  const tlsUrl = process.env.REDIS_TLS_URL;
  const redisUrl = process.env.REDIS_URL;

  if (tlsUrl) {
    logger.info('Using Redis store (TLS)');
    return new RedisStore(tlsUrl, { tls: true });
  }

  if (redisUrl) {
    logger.info('Using Redis store');
    return new RedisStore(redisUrl);
  }

  logger.info('Using in-memory store (no Redis configured)');
  return new MemoryStore();
}
