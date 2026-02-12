import { logger } from '../../shared/logger.js';
import { AuthenticationError } from '../../shared/errors.js';
import type { OAuthTokenResponse, CachedToken } from '../types.js';

const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes

export class AgentforceAuth {
  private readonly serverUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly clientEmail: string;
  private readonly tokenTtlMs: number;

  private cachedToken: CachedToken | null = null;
  private refreshPromise: Promise<CachedToken> | null = null;

  constructor(opts: {
    serverUrl: string;
    clientId: string;
    clientSecret: string;
    clientEmail: string;
    tokenTtlMs?: number;
  }) {
    this.serverUrl = opts.serverUrl;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.clientEmail = opts.clientEmail;
    this.tokenTtlMs = opts.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
  }

  /** Get a valid access token, refreshing if necessary. */
  async getToken(): Promise<CachedToken> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken;
    }

    // Coalesce concurrent refresh calls into a single request
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchToken().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  /** Force a token refresh (e.g. after a 401 response). */
  async forceRefresh(): Promise<CachedToken> {
    this.cachedToken = null;
    this.refreshPromise = null;
    return this.getToken();
  }

  /** Clear cached state (for testing). */
  reset(): void {
    this.cachedToken = null;
    this.refreshPromise = null;
  }

  // ── private ───────────────────────────────────────────────────────────────

  private async fetchToken(): Promise<CachedToken> {
    const tokenUrl = `https://${this.serverUrl}/services/oauth2/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      client_email: this.clientEmail,
    });

    logger.debug({ tokenUrl }, 'Requesting OAuth token');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, 'OAuth token request failed');
      throw new AuthenticationError(
        `OAuth token request failed (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as OAuthTokenResponse;

    this.cachedToken = {
      accessToken: data.access_token,
      instanceUrl: data.instance_url,
      expiresAt: Date.now() + this.tokenTtlMs,
    };

    logger.info('OAuth token acquired');
    return this.cachedToken;
  }
}
