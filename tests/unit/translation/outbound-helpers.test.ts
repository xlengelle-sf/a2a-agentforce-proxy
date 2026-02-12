import { describe, it, expect } from 'vitest';
import {
  createA2AMessageFromText,
  extractTextFromA2ATask,
} from '../../../src/translation/agentforce-to-a2a.js';
import type { A2ATask } from '../../../src/a2a/types.js';

describe('createA2AMessageFromText', () => {
  it('should create a user message with a single text part', () => {
    const msg = createA2AMessageFromText('What is the weather in Paris?');

    expect(msg.role).toBe('user');
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]).toEqual({ type: 'text', text: 'What is the weather in Paris?' });
  });

  it('should handle empty text', () => {
    const msg = createA2AMessageFromText('');

    expect(msg.role).toBe('user');
    expect(msg.parts[0]).toEqual({ type: 'text', text: '' });
  });
});

describe('extractTextFromA2ATask', () => {
  it('should extract text from artifacts', () => {
    const task: A2ATask = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'completed', timestamp: '2026-01-01T00:00:00Z' },
      artifacts: [
        {
          name: 'response',
          parts: [{ type: 'text', text: 'Sunny, 20°C in Paris' }],
          index: 0,
        },
      ],
    };

    expect(extractTextFromA2ATask(task)).toBe('Sunny, 20°C in Paris');
  });

  it('should concatenate multiple text parts with double newlines', () => {
    const task: A2ATask = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'completed', timestamp: '2026-01-01T00:00:00Z' },
      artifacts: [
        {
          name: 'response',
          parts: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
          index: 0,
        },
      ],
    };

    expect(extractTextFromA2ATask(task)).toBe('First part\n\nSecond part');
  });

  it('should skip non-text parts when extracting', () => {
    const task: A2ATask = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'completed', timestamp: '2026-01-01T00:00:00Z' },
      artifacts: [
        {
          name: 'response',
          parts: [
            { type: 'text', text: 'Text content' },
            { type: 'data', data: { key: 'value' } },
          ],
          index: 0,
        },
      ],
    };

    expect(extractTextFromA2ATask(task)).toBe('Text content');
  });

  it('should fall back to status message if no artifacts', () => {
    const task: A2ATask = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'input-required',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Could you clarify?' }],
        },
        timestamp: '2026-01-01T00:00:00Z',
      },
    };

    expect(extractTextFromA2ATask(task)).toBe('Could you clarify?');
  });

  it('should return empty string when no artifacts and no status message', () => {
    const task: A2ATask = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'completed', timestamp: '2026-01-01T00:00:00Z' },
    };

    expect(extractTextFromA2ATask(task)).toBe('');
  });

  it('should handle multiple artifacts', () => {
    const task: A2ATask = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'completed', timestamp: '2026-01-01T00:00:00Z' },
      artifacts: [
        { name: 'a1', parts: [{ type: 'text', text: 'Part A' }], index: 0 },
        { name: 'a2', parts: [{ type: 'text', text: 'Part B' }], index: 1 },
      ],
    };

    expect(extractTextFromA2ATask(task)).toBe('Part A\n\nPart B');
  });
});
