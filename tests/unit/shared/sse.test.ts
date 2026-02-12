import { describe, it, expect } from 'vitest';
import { formatSSE, formatHeartbeat, parseSSEEvents } from '../../../src/shared/sse.js';

describe('SSE Utilities', () => {
  describe('formatSSE', () => {
    it('should format an SSE event with type and data', () => {
      const result = formatSSE('status', { id: 'task-1', state: 'working' });
      expect(result).toBe('event: status\ndata: {"id":"task-1","state":"working"}\n\n');
    });

    it('should handle nested objects', () => {
      const result = formatSSE('artifact', { parts: [{ type: 'text', text: 'hello' }] });
      expect(result).toContain('"parts":[{"type":"text","text":"hello"}]');
      expect(result.startsWith('event: artifact\n')).toBe(true);
      expect(result.endsWith('\n\n')).toBe(true);
    });
  });

  describe('formatHeartbeat', () => {
    it('should format a heartbeat comment', () => {
      expect(formatHeartbeat()).toBe(':heartbeat\n\n');
    });
  });

  describe('parseSSEEvents', () => {
    it('should parse a single event', () => {
      const raw = 'event: status\ndata: {"state":"working"}\n\n';
      const events = parseSSEEvents(raw);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('status');
      expect(events[0].data).toBe('{"state":"working"}');
    });

    it('should parse multiple events', () => {
      const raw = [
        'event: status\ndata: {"state":"working"}',
        'event: artifact\ndata: {"text":"chunk1"}',
        'event: status\ndata: {"state":"completed"}',
      ].join('\n\n');

      const events = parseSSEEvents(raw);
      expect(events).toHaveLength(3);
      expect(events[0].event).toBe('status');
      expect(events[1].event).toBe('artifact');
      expect(events[2].event).toBe('status');
    });

    it('should ignore comment lines', () => {
      const raw = ':heartbeat\n\nevent: status\ndata: {"state":"working"}\n\n';
      const events = parseSSEEvents(raw);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('status');
    });

    it('should use "message" as default event type', () => {
      const raw = 'data: {"hello":"world"}\n\n';
      const events = parseSSEEvents(raw);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('message');
    });

    it('should skip blocks without data', () => {
      const raw = ':just-a-comment\n\n';
      const events = parseSSEEvents(raw);
      expect(events).toHaveLength(0);
    });

    it('should handle multiline data', () => {
      const raw = 'event: artifact\ndata: line1\ndata: line2\n\n';
      const events = parseSSEEvents(raw);
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('line1\nline2');
    });
  });
});
