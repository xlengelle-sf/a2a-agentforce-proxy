/**
 * ConversationEventStore — Ring buffer that stores recent conversation events.
 *
 * Auto-subscribes to ConversationEventBus on creation. When the buffer is full,
 * the oldest events are silently evicted.
 *
 * Memory budget: 500 events × ~500 bytes = ~250KB
 */

import type { ConversationEvent } from './event-bus.js';
import { getEventBus } from './event-bus.js';

const DEFAULT_CAPACITY = 500;

export class ConversationEventStore {
  private readonly buffer: (ConversationEvent | null)[];
  private readonly capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity?: number) {
    this.capacity = capacity ?? parseInt(process.env.DASHBOARD_EVENT_BUFFER_SIZE ?? String(DEFAULT_CAPACITY), 10);
    this.buffer = new Array(this.capacity).fill(null);

    // Auto-subscribe to the global event bus
    const bus = getEventBus();
    bus.on('conversation', (event: ConversationEvent) => {
      this.push(event);
    });
  }

  /** Add an event to the ring buffer. */
  push(event: ConversationEvent): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** Get all stored events, oldest first. */
  getAll(): ConversationEvent[] {
    if (this.count === 0) return [];

    const result: ConversationEvent[] = [];

    if (this.count < this.capacity) {
      // Buffer not yet full — events start at index 0
      for (let i = 0; i < this.count; i++) {
        result.push(this.buffer[i]!);
      }
    } else {
      // Buffer is full — oldest is at head (the next write position)
      for (let i = 0; i < this.capacity; i++) {
        const idx = (this.head + i) % this.capacity;
        result.push(this.buffer[idx]!);
      }
    }

    return result;
  }

  /** Get the N most recent events, newest last. */
  getRecent(n: number): ConversationEvent[] {
    const all = this.getAll();
    if (n >= all.length) return all;
    return all.slice(all.length - n);
  }

  /** Clear all events. */
  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }

  /** Number of events currently stored. */
  get size(): number {
    return this.count;
  }

  /** Oldest event timestamp (or null if empty). */
  get oldestTimestamp(): string | null {
    if (this.count === 0) return null;
    const all = this.getAll();
    return all[0].timestamp;
  }
}
