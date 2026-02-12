/**
 * SSE (Server-Sent Events) utilities for parsing and formatting.
 */

/**
 * Format a single SSE event for writing to an HTTP response.
 */
export function formatSSE(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Write a heartbeat comment to keep the connection alive.
 * SSE comments (lines starting with ':') are ignored by EventSource clients.
 */
export function formatHeartbeat(): string {
  return ':heartbeat\n\n';
}

/**
 * Set standard SSE response headers.
 */
export function setSSEHeaders(res: { writeHead: (status: number, headers: Record<string, string>) => void }): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });
}

/**
 * Start a periodic heartbeat to prevent Heroku 30s idle timeout.
 * Returns a cleanup function.
 */
export function startHeartbeat(
  writer: { write: (chunk: string) => boolean },
  intervalMs = 15_000,
): () => void {
  const timer = setInterval(() => {
    writer.write(formatHeartbeat());
  }, intervalMs);

  return () => clearInterval(timer);
}

// ─── SSE Parsing (for consuming upstream SSE streams) ───────────────────────

export interface ParsedSSEEvent {
  event: string;
  data: string;
}

/**
 * Parse raw SSE text into individual events.
 * Each event is separated by a blank line (\n\n).
 * Lines starting with ':' are comments (ignored).
 */
export function parseSSEEvents(raw: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = [];
  const blocks = raw.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let event = 'message';
    let data = '';

    for (const line of trimmed.split('\n')) {
      if (line.startsWith(':')) continue; // comment
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += (data ? '\n' : '') + line.slice(5).trim();
      }
    }

    if (data) {
      events.push({ event, data });
    }
  }

  return events;
}

/**
 * Async generator that yields SSE events from a ReadableStream (e.g. fetch response body).
 * Handles partial chunks across read boundaries.
 */
export async function* streamSSEEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedSSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double newline (SSE event boundary)
      const parts = buffer.split(/\n\n/);

      // Keep the last part as buffer (it may be incomplete)
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        let event = 'message';
        let data = '';

        for (const line of trimmed.split('\n')) {
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            data += (data ? '\n' : '') + line.slice(5).trim();
          }
        }

        if (data) {
          yield { event, data };
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      let event = 'message';
      let data = '';
      for (const line of buffer.trim().split('\n')) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data += (data ? '\n' : '') + line.slice(5).trim();
        }
      }
      if (data) {
        yield { event, data };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
