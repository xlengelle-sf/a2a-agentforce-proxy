import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/session/memory-store.js';
import type { SessionMapping } from '../../../src/session/store.js';

function makeSession(overrides?: Partial<SessionMapping>): SessionMapping {
  return {
    a2aContextId: 'ctx-1',
    a2aTaskIds: ['task-1'],
    afSessionId: 'af-sess-1',
    afSequenceId: 0,
    afAgentId: 'agent-1',
    tenantId: 'tenant-1',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    state: 'active',
    ...overrides,
  };
}

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('returns null for unknown contextId', async () => {
    expect(await store.get('unknown')).toBeNull();
  });

  it('returns null for unknown taskId', async () => {
    expect(await store.getByTaskId('unknown')).toBeNull();
  });

  it('set and get by contextId', async () => {
    const session = makeSession();
    await store.set('ctx-1', session);

    const result = await store.get('ctx-1');
    expect(result).toEqual(session);
  });

  it('get by taskId (reverse lookup)', async () => {
    const session = makeSession({ a2aTaskIds: ['task-a', 'task-b'] });
    await store.set('ctx-1', session);

    expect(await store.getByTaskId('task-a')).toEqual(session);
    expect(await store.getByTaskId('task-b')).toEqual(session);
    expect(await store.getByTaskId('task-c')).toBeNull();
  });

  it('update merges fields', async () => {
    await store.set('ctx-1', makeSession());
    await store.update('ctx-1', { afSequenceId: 5, state: 'completed' });

    const result = await store.get('ctx-1');
    expect(result!.afSequenceId).toBe(5);
    expect(result!.state).toBe('completed');
    expect(result!.afSessionId).toBe('af-sess-1'); // unchanged
  });

  it('update with new taskIds indexes them', async () => {
    await store.set('ctx-1', makeSession({ a2aTaskIds: ['task-1'] }));
    await store.update('ctx-1', { a2aTaskIds: ['task-1', 'task-2'] });

    expect(await store.getByTaskId('task-2')).not.toBeNull();
  });

  it('update on non-existent contextId is a no-op', async () => {
    await store.update('ghost', { afSequenceId: 99 });
    expect(await store.get('ghost')).toBeNull();
  });

  it('delete removes session and task index', async () => {
    await store.set('ctx-1', makeSession({ a2aTaskIds: ['task-1'] }));
    await store.delete('ctx-1');

    expect(await store.get('ctx-1')).toBeNull();
    expect(await store.getByTaskId('task-1')).toBeNull();
  });

  it('delete on non-existent contextId is a no-op', async () => {
    await expect(store.delete('ghost')).resolves.toBeUndefined();
  });

  it('cleanup removes sessions older than maxAgeSec', async () => {
    const old = makeSession({
      a2aContextId: 'old',
      a2aTaskIds: ['old-task'],
      lastActivity: Date.now() - 60_000, // 60s ago
    });
    const fresh = makeSession({
      a2aContextId: 'fresh',
      a2aTaskIds: ['fresh-task'],
      lastActivity: Date.now(),
    });

    await store.set('old', old);
    await store.set('fresh', fresh);

    const count = await store.cleanup(30); // 30s max age
    expect(count).toBe(1);
    expect(await store.get('old')).toBeNull();
    expect(await store.get('fresh')).not.toBeNull();
  });

  it('cleanup returns 0 when nothing to clean', async () => {
    await store.set('ctx-1', makeSession());
    expect(await store.cleanup(9999)).toBe(0);
  });
});
