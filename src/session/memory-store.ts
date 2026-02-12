import type { SessionMapping, SessionStore } from './store.js';

export class MemoryStore implements SessionStore {
  private sessions = new Map<string, SessionMapping>();
  private taskIndex = new Map<string, string>(); // taskId → contextId

  async get(contextId: string): Promise<SessionMapping | null> {
    return this.sessions.get(contextId) ?? null;
  }

  async set(contextId: string, session: SessionMapping): Promise<void> {
    this.sessions.set(contextId, session);
    for (const taskId of session.a2aTaskIds) {
      this.taskIndex.set(taskId, contextId);
    }
  }

  async update(contextId: string, updates: Partial<SessionMapping>): Promise<void> {
    const existing = this.sessions.get(contextId);
    if (!existing) return;

    const merged = { ...existing, ...updates };

    // If new taskIds were added, update the reverse index
    if (updates.a2aTaskIds) {
      for (const taskId of updates.a2aTaskIds) {
        this.taskIndex.set(taskId, contextId);
      }
    }

    this.sessions.set(contextId, merged);
  }

  async delete(contextId: string): Promise<void> {
    const session = this.sessions.get(contextId);
    if (session) {
      for (const taskId of session.a2aTaskIds) {
        this.taskIndex.delete(taskId);
      }
    }
    this.sessions.delete(contextId);
  }

  async getByTaskId(taskId: string): Promise<SessionMapping | null> {
    const contextId = this.taskIndex.get(taskId);
    if (!contextId) return null;
    return this.sessions.get(contextId) ?? null;
  }

  async cleanup(maxAgeSec: number): Promise<number> {
    const cutoff = Date.now() - maxAgeSec * 1000;
    let count = 0;

    for (const [contextId, session] of this.sessions) {
      if (session.lastActivity < cutoff) {
        await this.delete(contextId);
        count++;
      }
    }

    return count;
  }
}
