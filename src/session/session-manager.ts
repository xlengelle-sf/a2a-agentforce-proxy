import { logger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import type { SessionMapping, SessionStore } from './store.js';

export class SessionManager {
  private readonly store: SessionStore;
  private readonly ttlSeconds: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: SessionStore, opts?: { ttlSeconds?: number }) {
    this.store = store;
    this.ttlSeconds = opts?.ttlSeconds ?? 1800;
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  async getByContextId(contextId: string): Promise<SessionMapping | null> {
    return this.store.get(contextId);
  }

  async getByTaskId(taskId: string): Promise<SessionMapping | null> {
    return this.store.getByTaskId(taskId);
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  async createSession(params: {
    contextId: string;
    taskId: string;
    afSessionId: string;
    afAgentId: string;
    tenantId: string;
  }): Promise<SessionMapping> {
    const now = Date.now();

    const session: SessionMapping = {
      a2aContextId: params.contextId,
      a2aTaskIds: [params.taskId],
      afSessionId: params.afSessionId,
      afSequenceId: 0,
      afAgentId: params.afAgentId,
      tenantId: params.tenantId,
      createdAt: now,
      lastActivity: now,
      state: 'active',
    };

    await this.store.set(params.contextId, session);
    logger.info({ contextId: params.contextId, taskId: params.taskId }, 'Session created');
    return session;
  }

  async addTask(contextId: string, taskId: string): Promise<void> {
    const session = await this.store.get(contextId);
    if (!session) throw new NotFoundError(`Session ${contextId} not found`);

    const updatedTaskIds = [...session.a2aTaskIds, taskId];
    await this.store.update(contextId, {
      a2aTaskIds: updatedTaskIds,
      lastActivity: Date.now(),
    });
  }

  async nextSequenceId(contextId: string): Promise<number> {
    const session = await this.store.get(contextId);
    if (!session) throw new NotFoundError(`Session ${contextId} not found`);

    const next = session.afSequenceId + 1;
    await this.store.update(contextId, {
      afSequenceId: next,
      lastActivity: Date.now(),
    });
    return next;
  }

  async updateTaskState(
    contextId: string,
    state: Record<string, unknown>,
    artifacts?: Record<string, unknown>[],
  ): Promise<void> {
    const updates: Partial<SessionMapping> = {
      lastTaskState: state,
      lastActivity: Date.now(),
    };
    if (artifacts) updates.artifacts = artifacts;
    await this.store.update(contextId, updates);
  }

  async closeSession(
    contextId: string,
    reason: 'completed' | 'expired',
  ): Promise<void> {
    await this.store.update(contextId, { state: reason, lastActivity: Date.now() });
    logger.info({ contextId, reason }, 'Session closed');
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  async cleanupExpired(): Promise<number> {
    const count = await this.store.cleanup(this.ttlSeconds);
    if (count > 0) {
      logger.info({ count }, 'Expired sessions cleaned up');
    }
    return count;
  }

  /** Start periodic cleanup (every 5 minutes by default). */
  startCleanupInterval(intervalMs = 5 * 60 * 1000): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired().catch((err) => {
        logger.error({ err }, 'Session cleanup failed');
      });
    }, intervalMs);
  }

  /** Stop periodic cleanup (for graceful shutdown). */
  stopCleanupInterval(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
