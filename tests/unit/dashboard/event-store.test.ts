import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationEventStore } from '../../../src/dashboard/event-store.js';
import { getEventBus, resetEventBus, type ConversationEventInput } from '../../../src/dashboard/event-bus.js';

describe('ConversationEventStore', () => {
  beforeEach(() => {
    resetEventBus();
  });

  afterEach(() => {
    resetEventBus();
  });

  function makeInput(n: number): ConversationEventInput {
    return {
      direction: 'inbound',
      source: 'Agent',
      target: 'Agentforce',
      taskId: `task-${n}`,
      contextId: `ctx-${n}`,
      messageType: 'request',
      content: `Message ${n}`,
    };
  }

  it('should start empty', () => {
    const store = new ConversationEventStore(10);
    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);
    expect(store.oldestTimestamp).toBeNull();
  });

  it('should store events emitted by the bus', () => {
    const store = new ConversationEventStore(10);
    const bus = getEventBus();

    bus.emitConversation(makeInput(1));
    bus.emitConversation(makeInput(2));

    expect(store.size).toBe(2);
    const all = store.getAll();
    expect(all[0].content).toBe('Message 1');
    expect(all[1].content).toBe('Message 2');
  });

  it('should evict oldest events when capacity is reached', () => {
    const store = new ConversationEventStore(3);
    const bus = getEventBus();

    bus.emitConversation(makeInput(1));
    bus.emitConversation(makeInput(2));
    bus.emitConversation(makeInput(3));
    bus.emitConversation(makeInput(4)); // Evicts Message 1
    bus.emitConversation(makeInput(5)); // Evicts Message 2

    expect(store.size).toBe(3);
    const all = store.getAll();
    expect(all[0].content).toBe('Message 3');
    expect(all[1].content).toBe('Message 4');
    expect(all[2].content).toBe('Message 5');
  });

  it('should return correct recent events', () => {
    const store = new ConversationEventStore(10);
    const bus = getEventBus();

    for (let i = 1; i <= 5; i++) {
      bus.emitConversation(makeInput(i));
    }

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].content).toBe('Message 4');
    expect(recent[1].content).toBe('Message 5');
  });

  it('should handle getRecent with n > size', () => {
    const store = new ConversationEventStore(10);
    const bus = getEventBus();

    bus.emitConversation(makeInput(1));

    const recent = store.getRecent(100);
    expect(recent).toHaveLength(1);
    expect(recent[0].content).toBe('Message 1');
  });

  it('should clear all events', () => {
    const store = new ConversationEventStore(10);
    const bus = getEventBus();

    bus.emitConversation(makeInput(1));
    bus.emitConversation(makeInput(2));

    expect(store.size).toBe(2);

    store.clear();

    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);
  });

  it('should accept events after clear', () => {
    const store = new ConversationEventStore(10);
    const bus = getEventBus();

    bus.emitConversation(makeInput(1));
    store.clear();
    bus.emitConversation(makeInput(2));

    expect(store.size).toBe(1);
    expect(store.getAll()[0].content).toBe('Message 2');
  });

  it('should track oldestTimestamp', () => {
    const store = new ConversationEventStore(3);

    // Manually push events with distinct timestamps to avoid same-ms issue
    store.push({
      id: '1', timestamp: '2025-01-01T00:00:01.000Z',
      direction: 'inbound', source: 'A', target: 'B',
      taskId: 't1', contextId: 'c1', messageType: 'request', content: 'M1',
    });
    store.push({
      id: '2', timestamp: '2025-01-01T00:00:02.000Z',
      direction: 'inbound', source: 'A', target: 'B',
      taskId: 't2', contextId: 'c2', messageType: 'request', content: 'M2',
    });
    store.push({
      id: '3', timestamp: '2025-01-01T00:00:03.000Z',
      direction: 'inbound', source: 'A', target: 'B',
      taskId: 't3', contextId: 'c3', messageType: 'request', content: 'M3',
    });

    expect(store.oldestTimestamp).toBe('2025-01-01T00:00:01.000Z');

    // Push 4th — evicts M1
    store.push({
      id: '4', timestamp: '2025-01-01T00:00:04.000Z',
      direction: 'inbound', source: 'A', target: 'B',
      taskId: 't4', contextId: 'c4', messageType: 'request', content: 'M4',
    });

    expect(store.oldestTimestamp).toBe('2025-01-01T00:00:02.000Z');
  });

  it('should wrap correctly with many items', () => {
    const store = new ConversationEventStore(5);
    const bus = getEventBus();

    // Fill and overflow multiple times
    for (let i = 1; i <= 20; i++) {
      bus.emitConversation(makeInput(i));
    }

    expect(store.size).toBe(5);
    const all = store.getAll();
    expect(all[0].content).toBe('Message 16');
    expect(all[4].content).toBe('Message 20');
  });

  it('should push events directly', () => {
    const store = new ConversationEventStore(10);

    store.push({
      id: 'manual-1',
      timestamp: new Date().toISOString(),
      direction: 'outbound',
      source: 'Agentforce',
      target: 'Weather Agent',
      taskId: 'task-m1',
      contextId: 'ctx-m1',
      messageType: 'response',
      content: 'Manual event',
    });

    expect(store.size).toBe(1);
    expect(store.getAll()[0].content).toBe('Manual event');
  });
});
