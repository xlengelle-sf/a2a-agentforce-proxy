import { describe, it, expect } from 'vitest';
import {
  translateAgentforceResponseToTask,
  buildFailedTask,
  buildCanceledTask,
} from '../../../src/translation/agentforce-to-a2a.js';
import { successfulResponse, questionResponse } from '../../fixtures/agentforce-responses.js';

describe('translateAgentforceResponseToTask', () => {
  it('translates a successful response to a completed task', () => {
    const task = translateAgentforceResponseToTask(successfulResponse, 'task-1', 'ctx-1');

    expect(task.id).toBe('task-1');
    expect(task.contextId).toBe('ctx-1');
    expect(task.status.state).toBe('completed');
    expect(task.status.timestamp).toBeDefined();
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts![0].parts[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('3 hotels near CDG'),
    });
  });

  it('detects input-required when response is a question', () => {
    const task = translateAgentforceResponseToTask(questionResponse, 'task-2', 'ctx-2');

    expect(task.status.state).toBe('input-required');
    expect(task.status.message).toBeDefined();
    expect(task.status.message!.role).toBe('agent');
    expect(task.status.message!.parts[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('Could you please specify'),
    });
  });

  it('handles empty message text gracefully', () => {
    const task = translateAgentforceResponseToTask(
      { messages: [{ id: 'm', type: 'Text', message: '' }] },
      'task-3',
      'ctx-3',
    );
    expect(task.status.state).toBe('completed');
    expect(task.artifacts![0].parts[0]).toEqual({ type: 'text', text: '' });
  });

  it('handles missing messages array', () => {
    const task = translateAgentforceResponseToTask(
      { messages: [] } as any,
      'task-4',
      'ctx-4',
    );
    expect(task.status.state).toBe('completed');
    expect(task.artifacts![0].parts[0]).toEqual({ type: 'text', text: '' });
  });
});

describe('buildFailedTask', () => {
  it('creates a failed task with error message', () => {
    const task = buildFailedTask('task-1', 'ctx-1', 'Something went wrong');
    expect(task.status.state).toBe('failed');
    expect(task.status.message!.parts[0]).toEqual({
      type: 'text',
      text: 'Something went wrong',
    });
  });
});

describe('buildCanceledTask', () => {
  it('creates a canceled task', () => {
    const task = buildCanceledTask('task-1', 'ctx-1');
    expect(task.status.state).toBe('canceled');
    expect(task.artifacts).toBeUndefined();
  });
});
