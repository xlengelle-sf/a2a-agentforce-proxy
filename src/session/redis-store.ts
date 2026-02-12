import RedisLib from 'ioredis';
import { logger } from '../shared/logger.js';
import type { SessionMapping, SessionStore } from './store.js';

// ioredis ESM compat: the default export may be wrapped in .default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Redis = (RedisLib as any).default ?? RedisLib;

const SESSION_PREFIX = 'session:';
const TASK_PREFIX = 'task:';

export class RedisStore implements SessionStore {
  private readonly redis: InstanceType<typeof Redis>;
  private readonly defaultTtl: number; // seconds

  constructor(redisUrl: string, opts?: { tls?: boolean; ttlSeconds?: number }) {
    this.defaultTtl = opts?.ttlSeconds ?? 1800;

    this.redis = new Redis(redisUrl, {
      tls: opts?.tls ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('error', (err: Error) => {
      logger.error({ err }, 'Redis connection error');
    });
  }

  /** Explicitly connect (call once at startup). */
  async connect(): Promise<void> {
    await this.redis.connect();
    logger.info('Redis store connected');
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  async get(contextId: string): Promise<SessionMapping | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${contextId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SessionMapping;
  }

  async set(contextId: string, session: SessionMapping): Promise<void> {
    const pipeline = this.redis.pipeline();

    pipeline.set(
      `${SESSION_PREFIX}${contextId}`,
      JSON.stringify(session),
      'EX',
      this.defaultTtl,
    );

    for (const taskId of session.a2aTaskIds) {
      pipeline.set(`${TASK_PREFIX}${taskId}`, contextId, 'EX', this.defaultTtl);
    }

    await pipeline.exec();
  }

  async update(contextId: string, updates: Partial<SessionMapping>): Promise<void> {
    const existing = await this.get(contextId);
    if (!existing) return;

    const merged = { ...existing, ...updates };

    const pipeline = this.redis.pipeline();

    pipeline.set(
      `${SESSION_PREFIX}${contextId}`,
      JSON.stringify(merged),
      'EX',
      this.defaultTtl,
    );

    // Index any new taskIds
    if (updates.a2aTaskIds) {
      for (const taskId of updates.a2aTaskIds) {
        pipeline.set(`${TASK_PREFIX}${taskId}`, contextId, 'EX', this.defaultTtl);
      }
    }

    await pipeline.exec();
  }

  async delete(contextId: string): Promise<void> {
    const existing = await this.get(contextId);
    if (!existing) {
      await this.redis.del(`${SESSION_PREFIX}${contextId}`);
      return;
    }

    const pipeline = this.redis.pipeline();
    pipeline.del(`${SESSION_PREFIX}${contextId}`);
    for (const taskId of existing.a2aTaskIds) {
      pipeline.del(`${TASK_PREFIX}${taskId}`);
    }
    await pipeline.exec();
  }

  async getByTaskId(taskId: string): Promise<SessionMapping | null> {
    const contextId = await this.redis.get(`${TASK_PREFIX}${taskId}`);
    if (!contextId) return null;
    return this.get(contextId);
  }

  async cleanup(maxAgeSec: number): Promise<number> {
    // Redis TTL handles expiration automatically.
    // This is a safety-net scan for sessions that might have lost their TTL.
    let count = 0;
    const cutoff = Date.now() - maxAgeSec * 1000;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${SESSION_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (!raw) continue;

        const session = JSON.parse(raw) as SessionMapping;
        if (session.lastActivity < cutoff) {
          const contextId = key.slice(SESSION_PREFIX.length);
          await this.delete(contextId);
          count++;
        }
      }
    } while (cursor !== '0');

    return count;
  }
}
