import { describe, it, expect } from 'vitest';
import { bridgeAgentforceToA2A } from '../../../src/translation/streaming-bridge.js';
import type { AgentforceStreamEvent } from '../../../src/agentforce/types.js';

async function collectEvents(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

async function* toAsyncGen<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe('Streaming Bridge (Agentforce → A2A)', () => {
  it('should translate ProgressIndicator to status working', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'ProgressIndicator', data: { text: 'Thinking...' } },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'status',
      data: {
        id: 'task-1',
        status: { state: 'working' },
        final: false,
      },
    });
  });

  it('should translate TextChunk to artifact with append=true', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'TextChunk', data: { text: 'Hello ' } },
      { type: 'TextChunk', data: { text: 'world!' } },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'artifact',
      data: {
        id: 'task-1',
        artifact: {
          parts: [{ type: 'text', text: 'Hello ' }],
          index: 0,
          append: true,
        },
      },
    });
    expect(events[1]).toMatchObject({
      type: 'artifact',
      data: {
        artifact: {
          parts: [{ type: 'text', text: 'world!' }],
          index: 0,
          append: true,
        },
      },
    });
  });

  it('should translate Inform to artifact with lastChunk=true', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'Inform', data: { message: 'The weather in Paris is sunny.' } },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'artifact',
      data: {
        artifact: {
          parts: [{ type: 'text', text: 'The weather in Paris is sunny.' }],
          lastChunk: true,
        },
      },
    });
  });

  it('should translate EndOfTurn to status completed with final=true', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'EndOfTurn', data: {} },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'status',
      data: {
        id: 'task-1',
        status: { state: 'completed' },
        final: true,
      },
    });
  });

  it('should translate ValidationFailureChunk to status failed', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'ValidationFailureChunk', data: { message: 'Input too long' } },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'status',
      data: {
        id: 'task-1',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'Input too long' }],
          },
        },
        final: true,
      },
    });
  });

  it('should handle a full conversation stream', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'ProgressIndicator', data: { text: 'Working...' } },
      { type: 'TextChunk', data: { text: 'The weather ' } },
      { type: 'TextChunk', data: { text: 'in Paris is ' } },
      { type: 'TextChunk', data: { text: 'sunny, 20°C.' } },
      { type: 'Inform', data: { message: 'The weather in Paris is sunny, 20°C.' } },
      { type: 'EndOfTurn', data: {} },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    expect(events).toHaveLength(6);

    // Progress → working
    expect((events[0] as any).type).toBe('status');
    expect((events[0] as any).data.status.state).toBe('working');

    // 3 text chunks → artifact append
    for (let i = 1; i <= 3; i++) {
      expect((events[i] as any).type).toBe('artifact');
      expect((events[i] as any).data.artifact.append).toBe(true);
    }

    // Inform → artifact lastChunk
    expect((events[4] as any).type).toBe('artifact');
    expect((events[4] as any).data.artifact.lastChunk).toBe(true);

    // EndOfTurn → completed
    expect((events[5] as any).type).toBe('status');
    expect((events[5] as any).data.status.state).toBe('completed');
    expect((events[5] as any).data.final).toBe(true);
  });

  it('should increment artifact index after Inform events', async () => {
    const afEvents: AgentforceStreamEvent[] = [
      { type: 'Inform', data: { message: 'First message' } },
      { type: 'TextChunk', data: { text: 'Second chunk' } },
      { type: 'Inform', data: { message: 'Second message' } },
    ];

    const events = await collectEvents(
      bridgeAgentforceToA2A(toAsyncGen(afEvents), 'task-1', 'ctx-1'),
    );

    // First Inform → index 0
    expect((events[0] as any).data.artifact.index).toBe(0);
    // TextChunk after Inform → index 1 (incremented after first Inform)
    expect((events[1] as any).data.artifact.index).toBe(1);
    // Second Inform → index 1
    expect((events[2] as any).data.artifact.index).toBe(1);
  });
});
