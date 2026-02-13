import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/logger.js';
import { UpstreamError } from '../../shared/errors.js';
import type { AgentforceSessionRequest, AgentforceSessionResponse } from '../types.js';

const API_BASE = 'https://api.salesforce.com';

export class AgentforceSession {
  /** Create a new Agentforce agent session. */
  async create(
    accessToken: string,
    instanceUrl: string,
    agentId: string,
  ): Promise<string> {
    const url = `${API_BASE}/einstein/ai-agent/v1/agents/${agentId}/sessions`;

    const body: AgentforceSessionRequest = {
      externalSessionKey: randomUUID(),
      instanceConfig: { endpoint: instanceUrl },
      streamingCapabilities: { chunkTypes: ['Text'] },
      bypassUser: true,
    };

    logger.info({ url, agentId, instanceUrl, bodyPayload: body }, 'Creating Agentforce session');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text, url, agentId, instanceUrl }, 'Session creation failed');

      let hint = '';
      if (res.status === 404) {
        hint =
          ' — Verify that: (1) the Agent API is enabled on your org, ' +
          '(2) you created an External Client App (ECA) with the chatbot_api and sfap_api OAuth scopes, ' +
          '(3) the agent is activated and published, ' +
          '(4) the agent ID is correct (BotDefinition Id starting with 0Xx)';
      } else if (res.status === 401) {
        hint = ' — Access token may be expired or invalid. Try re-authenticating.';
      }

      throw new UpstreamError(
        `Agentforce session creation failed (${res.status}): ${text || '(empty response)'}${hint}`,
        'agentforce',
      );
    }

    const data = (await res.json()) as AgentforceSessionResponse;

    if (!data.sessionId) {
      throw new UpstreamError('No sessionId in Agentforce response', 'agentforce');
    }

    logger.info({ sessionId: data.sessionId }, 'Agentforce session created');
    return data.sessionId;
  }

  /** Delete an existing Agentforce session. */
  async delete(accessToken: string, sessionId: string): Promise<void> {
    const url = `${API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}`;

    logger.debug({ sessionId }, 'Deleting Agentforce session');

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn(
        { status: res.status, sessionId, body: text },
        'Session deletion returned non-OK (may already be expired)',
      );
    } else {
      logger.info({ sessionId }, 'Agentforce session deleted');
    }
  }
}
