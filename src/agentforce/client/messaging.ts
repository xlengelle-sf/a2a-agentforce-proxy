import { logger } from '../../shared/logger.js';
import { UpstreamError } from '../../shared/errors.js';
import type { AgentforceMessageRequest, AgentforceMessageResponse } from '../types.js';

const API_BASE = 'https://api.salesforce.com';
const DEFAULT_TIMEOUT_MS = 120_000;

export interface SendMessageResult {
  text: string;
  feedbackId?: string;
  planId?: string;
  raw: AgentforceMessageResponse;
}

export class AgentforceMessaging {
  private readonly timeoutMs: number;

  constructor(opts?: { timeoutMs?: number }) {
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Send a synchronous text message to an Agentforce session. */
  async send(
    accessToken: string,
    sessionId: string,
    sequenceId: number,
    text: string,
  ): Promise<SendMessageResult> {
    const url = `${API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}/messages`;

    const body: AgentforceMessageRequest = {
      message: { sequenceId, type: 'Text', text },
    };

    logger.debug({ sessionId, sequenceId }, 'Sending message to Agentforce');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error(
          { status: res.status, sessionId, body: errText },
          'Agentforce message failed',
        );
        throw new UpstreamError(
          `Agentforce message failed (${res.status}): ${errText}`,
          'agentforce',
        );
      }

      const data = (await res.json()) as AgentforceMessageResponse;

      if (!data.messages || data.messages.length === 0) {
        throw new UpstreamError('Empty response from Agentforce', 'agentforce');
      }

      const first = data.messages[0];

      logger.info(
        { sessionId, sequenceId, responseLength: first.message?.length },
        'Agentforce message received',
      );

      return {
        text: first.message,
        feedbackId: first.feedbackId,
        planId: first.planId,
        raw: data,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new UpstreamError(
          `Agentforce message timed out after ${this.timeoutMs}ms`,
          'agentforce',
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
