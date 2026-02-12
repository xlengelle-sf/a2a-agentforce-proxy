import { logger } from '../../shared/logger.js';
import { AuthenticationError } from '../../shared/errors.js';
import type { AgentforceClientConfig, CachedToken } from '../types.js';
import type { SendMessageResult } from './messaging.js';
import { AgentforceAuth } from './auth.js';
import { AgentforceSession } from './session.js';
import { AgentforceMessaging } from './messaging.js';

export { AgentforceAuth } from './auth.js';
export { AgentforceSession } from './session.js';
export { AgentforceMessaging, type SendMessageResult } from './messaging.js';
export { streamAgentforceMessages } from './streaming.js';

export class AgentforceClient {
  private readonly auth: AgentforceAuth;
  private readonly session: AgentforceSession;
  private readonly messaging: AgentforceMessaging;
  private readonly agentId: string;

  constructor(config: AgentforceClientConfig) {
    this.agentId = config.agentId;
    this.auth = new AgentforceAuth({
      serverUrl: config.serverUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      clientEmail: config.clientEmail,
      tokenTtlMs: config.tokenTtlMs,
    });
    this.session = new AgentforceSession();
    this.messaging = new AgentforceMessaging({
      timeoutMs: config.messageTimeoutMs,
    });
  }

  /** Authenticate (or return cached token). */
  async authenticate(): Promise<CachedToken> {
    return this.auth.getToken();
  }

  /** Create a new Agentforce agent session. Returns the sessionId. */
  async createSession(): Promise<string> {
    const token = await this.auth.getToken();
    return this.session.create(token.accessToken, token.instanceUrl, this.agentId);
  }

  /** Send a synchronous message, auto-retrying once on 401. */
  async sendMessage(
    sessionId: string,
    sequenceId: number,
    text: string,
  ): Promise<SendMessageResult> {
    let token = await this.auth.getToken();

    try {
      return await this.messaging.send(token.accessToken, sessionId, sequenceId, text);
    } catch (err: unknown) {
      if (err instanceof AuthenticationError) {
        logger.warn('Got 401, refreshing token and retrying');
        token = await this.auth.forceRefresh();
        return this.messaging.send(token.accessToken, sessionId, sequenceId, text);
      }
      throw err;
    }
  }

  /** Delete an Agentforce session (best-effort). */
  async deleteSession(sessionId: string): Promise<void> {
    const token = await this.auth.getToken();
    return this.session.delete(token.accessToken, sessionId);
  }

  /** Quick health check: authenticate and confirm we can reach the API. */
  async healthCheck(): Promise<boolean> {
    try {
      await this.auth.getToken();
      return true;
    } catch {
      return false;
    }
  }
}
