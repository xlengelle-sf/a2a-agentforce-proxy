import { logger } from '../../shared/logger.js';
import { UpstreamError } from '../../shared/errors.js';
import { streamSSEEvents } from '../../shared/sse.js';
import type { AgentforceStreamEvent } from '../types.js';

const API_BASE = 'https://api.salesforce.com';
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Stream messages from Agentforce's SSE endpoint.
 *
 * POSTs to `/sessions/{sessionId}/messages/stream` and yields typed
 * Agentforce SSE events as they arrive.
 */
export async function* streamAgentforceMessages(
  accessToken: string,
  sessionId: string,
  sequenceId: number,
  text: string,
  opts?: { timeoutMs?: number },
): AsyncGenerator<AgentforceStreamEvent> {
  const url = `${API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}/messages/stream`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: { sequenceId, type: 'Text', text },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UpstreamError(
        `Agentforce streaming timed out after ${timeoutMs}ms`,
        'agentforce',
      );
    }
    throw new UpstreamError(
      `Agentforce streaming request failed: ${(err as Error).message}`,
      'agentforce',
    );
  }

  if (!response.ok) {
    clearTimeout(timer);
    const errText = await response.text().catch(() => '');
    throw new UpstreamError(
      `Agentforce streaming failed (${response.status}): ${errText}`,
      'agentforce',
    );
  }

  if (!response.body) {
    clearTimeout(timer);
    throw new UpstreamError('No response body from Agentforce streaming endpoint', 'agentforce');
  }

  try {
    for await (const sseEvent of streamSSEEvents(response.body)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(sseEvent.data);
      } catch {
        logger.warn({ raw: sseEvent.data }, 'Failed to parse Agentforce SSE event data');
        continue;
      }

      const event = {
        type: sseEvent.event,
        data: parsed,
      } as AgentforceStreamEvent;

      logger.debug({ eventType: event.type }, 'Agentforce stream event');
      yield event;
    }
  } finally {
    clearTimeout(timer);
  }
}
