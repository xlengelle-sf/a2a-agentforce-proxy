/**
 * ConversationEventBus — Singleton EventEmitter for capturing
 * all agent conversation events across the proxy.
 *
 * Three hook points emit events:
 *   - src/a2a/server/jsonrpc-handler.ts (inbound A2A → Agentforce)
 *   - src/a2a/server/streaming.ts       (inbound streaming)
 *   - src/agentforce/action-endpoint/delegate.ts (outbound Agentforce → A2A)
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConversationEvent {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  source: string;
  target: string;
  taskId: string;
  contextId: string;
  messageType: 'request' | 'response' | 'error' | 'stream-chunk' | 'status';
  content: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export type ConversationEventInput = Omit<ConversationEvent, 'id' | 'timestamp'>;

// ─── Event Bus ──────────────────────────────────────────────────────────────

export class ConversationEventBus extends EventEmitter {
  /**
   * Emit a conversation event. Auto-generates `id` and `timestamp`.
   */
  emitConversation(input: ConversationEventInput): ConversationEvent {
    const event: ConversationEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };

    this.emit('conversation', event);
    return event;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: ConversationEventBus | null = null;

/**
 * Get the global ConversationEventBus instance.
 * Creates a new instance on first call.
 */
export function getEventBus(): ConversationEventBus {
  if (!instance) {
    instance = new ConversationEventBus();
    instance.setMaxListeners(50); // Allow many SSE clients
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetEventBus(): void {
  if (instance) {
    instance.removeAllListeners();
  }
  instance = null;
}
