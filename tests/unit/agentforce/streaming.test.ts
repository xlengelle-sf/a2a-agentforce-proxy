import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAgentforceMessages } from '../../../src/agentforce/client/streaming.js';

describe('Agentforce Streaming Client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      },
    });
  }

  it('should yield parsed SSE events from Agentforce stream', async () => {
    const sseData = [
      'event: ProgressIndicator\ndata: {"text":"Thinking..."}\n\n',
      'event: TextChunk\ndata: {"text":"Hello "}\n\n',
      'event: TextChunk\ndata: {"text":"world!"}\n\n',
      'event: EndOfTurn\ndata: {}\n\n',
    ];

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(createSSEStream(sseData), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const events: unknown[] = [];
    for await (const event of streamAgentforceMessages('token', 'sess-1', 1, 'Hello')) {
      events.push(event);
    }

    expect(events).toHaveLength(4);
    expect((events[0] as any).type).toBe('ProgressIndicator');
    expect((events[1] as any).type).toBe('TextChunk');
    expect((events[1] as any).data.text).toBe('Hello ');
    expect((events[2] as any).type).toBe('TextChunk');
    expect((events[2] as any).data.text).toBe('world!');
    expect((events[3] as any).type).toBe('EndOfTurn');
  });

  it('should skip SSE events with invalid JSON data', async () => {
    const sseData = [
      'event: TextChunk\ndata: not-json\n\n',
      'event: TextChunk\ndata: {"text":"valid"}\n\n',
    ];

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(createSSEStream(sseData), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const events: unknown[] = [];
    for await (const event of streamAgentforceMessages('token', 'sess-1', 1, 'Hi')) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect((events[0] as any).data.text).toBe('valid');
  });

  it('should throw UpstreamError on non-200 response', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 })),
    );

    const gen = streamAgentforceMessages('bad-token', 'sess-1', 1, 'Hello');

    await expect(gen.next()).rejects.toThrow(/streaming failed \(401\)/);
  });

  it('should throw UpstreamError on timeout', async () => {
    fetchSpy.mockImplementation((_url, init) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response('ok', { status: 200 })),
          500,
        );
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const gen = streamAgentforceMessages('token', 'sess-1', 1, 'Hello', { timeoutMs: 50 });

    await expect(gen.next()).rejects.toThrow(/timed out/);
  });

  it('should throw UpstreamError when response has no body', async () => {
    // Simulate a response with null body
    const mockResponse = new Response(null, { status: 200 });
    Object.defineProperty(mockResponse, 'body', { value: null });

    fetchSpy.mockImplementation(() => Promise.resolve(mockResponse));

    const gen = streamAgentforceMessages('token', 'sess-1', 1, 'Hello');

    await expect(gen.next()).rejects.toThrow(/No response body/);
  });

  it('should throw UpstreamError on network failure', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.reject(new TypeError('fetch failed')),
    );

    const gen = streamAgentforceMessages('token', 'sess-1', 1, 'Hello');

    await expect(gen.next()).rejects.toThrow(/streaming request failed/);
  });

  it('should handle Inform events with cited references', async () => {
    const sseData = [
      'event: Inform\ndata: {"message":"Here is the info","citedReferences":[{"title":"Doc"}]}\n\n',
    ];

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(createSSEStream(sseData), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const events: unknown[] = [];
    for await (const event of streamAgentforceMessages('token', 'sess-1', 1, 'Info?')) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect((events[0] as any).type).toBe('Inform');
    expect((events[0] as any).data.message).toBe('Here is the info');
    expect((events[0] as any).data.citedReferences).toHaveLength(1);
  });
});
