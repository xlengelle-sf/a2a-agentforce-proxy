import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConversationEventBus,
  getEventBus,
  resetEventBus,
  type ConversationEvent,
  type ConversationEventInput,
} from '../../../src/dashboard/event-bus.js';

describe('ConversationEventBus', () => {
  let bus: ConversationEventBus;

  beforeEach(() => {
    resetEventBus();
    bus = getEventBus();
  });

  afterEach(() => {
    resetEventBus();
  });

  const sampleInput: ConversationEventInput = {
    direction: 'inbound',
    source: 'External Agent',
    target: 'Agentforce',
    taskId: 'task-1',
    contextId: 'ctx-1',
    messageType: 'request',
    content: 'Hello!',
  };

  it('should emit conversation events', () => {
    const received: ConversationEvent[] = [];
    bus.on('conversation', (e: ConversationEvent) => received.push(e));

    bus.emitConversation(sampleInput);

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('Hello!');
    expect(received[0].direction).toBe('inbound');
    expect(received[0].source).toBe('External Agent');
  });

  it('should auto-generate id and timestamp', () => {
    const received: ConversationEvent[] = [];
    bus.on('conversation', (e: ConversationEvent) => received.push(e));

    bus.emitConversation(sampleInput);

    expect(received[0].id).toBeTruthy();
    expect(received[0].id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(received[0].timestamp).toBeTruthy();
    expect(new Date(received[0].timestamp).getTime()).not.toBeNaN();
  });

  it('should return the emitted event', () => {
    const event = bus.emitConversation(sampleInput);

    expect(event.id).toBeTruthy();
    expect(event.content).toBe('Hello!');
    expect(event.messageType).toBe('request');
  });

  it('should support multiple listeners', () => {
    let count = 0;
    bus.on('conversation', () => count++);
    bus.on('conversation', () => count++);

    bus.emitConversation(sampleInput);

    expect(count).toBe(2);
  });

  it('should preserve optional fields', () => {
    const received: ConversationEvent[] = [];
    bus.on('conversation', (e: ConversationEvent) => received.push(e));

    bus.emitConversation({
      ...sampleInput,
      latencyMs: 150,
      metadata: { agentVersion: '1.0' },
    });

    expect(received[0].latencyMs).toBe(150);
    expect(received[0].metadata).toEqual({ agentVersion: '1.0' });
  });

  it('should return the same instance from getEventBus()', () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  it('should return a fresh instance after resetEventBus()', () => {
    const bus1 = getEventBus();
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus1).not.toBe(bus2);
  });

  it('should remove all listeners on reset', () => {
    let called = false;
    bus.on('conversation', () => { called = true; });

    resetEventBus();

    // Get a new bus and emit — old listener should NOT fire
    const newBus = getEventBus();
    newBus.emitConversation(sampleInput);

    expect(called).toBe(false);
  });
});
