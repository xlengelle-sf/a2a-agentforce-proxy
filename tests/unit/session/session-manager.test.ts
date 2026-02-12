import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../../src/session/session-manager.js';
import { MemoryStore } from '../../../src/session/memory-store.js';
import { NotFoundError } from '../../../src/shared/errors.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new MemoryStore(), { ttlSeconds: 1800 });
  });

  it('creates a session and retrieves by contextId', async () => {
    const session = await manager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    expect(session.a2aContextId).toBe('ctx-1');
    expect(session.afSessionId).toBe('af-sess-1');
    expect(session.afSequenceId).toBe(0);
    expect(session.state).toBe('active');

    const found = await manager.getByContextId('ctx-1');
    expect(found).toEqual(session);
  });

  it('retrieves session by taskId', async () => {
    await manager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    const found = await manager.getByTaskId('task-1');
    expect(found!.a2aContextId).toBe('ctx-1');
  });

  it('returns null for unknown contextId', async () => {
    expect(await manager.getByContextId('nope')).toBeNull();
  });

  it('returns null for unknown taskId', async () => {
    expect(await manager.getByTaskId('nope')).toBeNull();
  });

  it('addTask appends to task list', async () => {
    await manager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    await manager.addTask('ctx-1', 'task-2');

    const session = await manager.getByContextId('ctx-1');
    expect(session!.a2aTaskIds).toEqual(['task-1', 'task-2']);

    // Reverse lookup for the new task also works
    expect(await manager.getByTaskId('task-2')).not.toBeNull();
  });

  it('addTask throws NotFoundError for unknown context', async () => {
    await expect(manager.addTask('ghost', 'task-x')).rejects.toThrow(NotFoundError);
  });

  it('nextSequenceId increments correctly', async () => {
    await manager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    expect(await manager.nextSequenceId('ctx-1')).toBe(1);
    expect(await manager.nextSequenceId('ctx-1')).toBe(2);
    expect(await manager.nextSequenceId('ctx-1')).toBe(3);

    const session = await manager.getByContextId('ctx-1');
    expect(session!.afSequenceId).toBe(3);
  });

  it('nextSequenceId throws NotFoundError for unknown context', async () => {
    await expect(manager.nextSequenceId('ghost')).rejects.toThrow(NotFoundError);
  });

  it('updateTaskState stores state and artifacts', async () => {
    await manager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    const state = { state: 'completed', timestamp: '2026-01-01T00:00:00Z' };
    const artifacts = [{ name: 'response', parts: [{ type: 'text', text: 'hello' }] }];

    await manager.updateTaskState('ctx-1', state, artifacts);

    const session = await manager.getByContextId('ctx-1');
    expect(session!.lastTaskState).toEqual(state);
    expect(session!.artifacts).toEqual(artifacts);
  });

  it('closeSession marks the session', async () => {
    await manager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    await manager.closeSession('ctx-1', 'completed');

    const session = await manager.getByContextId('ctx-1');
    expect(session!.state).toBe('completed');
  });

  it('cleanupExpired removes old sessions', async () => {
    // Create manager with 1-second TTL for testing
    const shortManager = new SessionManager(new MemoryStore(), { ttlSeconds: 1 });

    await shortManager.createSession({
      contextId: 'ctx-1',
      taskId: 'task-1',
      afSessionId: 'af-sess-1',
      afAgentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    // Wait for TTL
    await new Promise((r) => setTimeout(r, 1100));

    const count = await shortManager.cleanupExpired();
    expect(count).toBe(1);
    expect(await shortManager.getByContextId('ctx-1')).toBeNull();
  });
});
