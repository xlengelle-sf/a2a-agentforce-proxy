import { logger } from '../../shared/logger.js';
import { UpstreamError, ValidationError } from '../../shared/errors.js';
import type { AgentCard } from '../types.js';

interface CacheEntry {
  card: AgentCard;
  fetchedAt: number;
}

/**
 * Resolves and caches Agent Cards from external A2A agents.
 *
 * Fetches `GET {agentUrl}/.well-known/agent-card.json`, validates required
 * fields, and caches the result with a configurable TTL.
 */
export class AgentCardResolver {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly timeoutMs: number;

  constructor(opts?: { ttlMs?: number; timeoutMs?: number }) {
    this.ttlMs = opts?.ttlMs ?? 5 * 60 * 1000; // 5 minutes
    this.timeoutMs = opts?.timeoutMs ?? 10_000;  // 10 seconds
  }

  /**
   * Resolve the Agent Card for the given agent base URL.
   * Returns cached version if available and not expired.
   */
  async resolve(agentUrl: string): Promise<AgentCard> {
    const normalizedUrl = agentUrl.replace(/\/+$/, '');

    // Check cache
    const cached = this.cache.get(normalizedUrl);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      logger.debug({ agentUrl: normalizedUrl }, 'Agent card cache hit');
      return cached.card;
    }

    // Fetch fresh card
    const card = await this.fetchCard(normalizedUrl);

    // Cache it
    this.cache.set(normalizedUrl, { card, fetchedAt: Date.now() });
    logger.info({ agentUrl: normalizedUrl, name: card.name }, 'Agent card resolved and cached');

    return card;
  }

  /** Remove a cached card so the next resolve() fetches fresh. */
  invalidateCache(agentUrl: string): void {
    const normalizedUrl = agentUrl.replace(/\/+$/, '');
    this.cache.delete(normalizedUrl);
  }

  /** Clear entire cache. */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async fetchCard(baseUrl: string): Promise<AgentCard> {
    const url = `${baseUrl}/.well-known/agent-card.json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new UpstreamError(`Agent card request timed out: ${url}`, baseUrl);
      }
      throw new UpstreamError(
        `Failed to fetch agent card: ${(err as Error).message}`,
        baseUrl,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new UpstreamError(
        `Agent card fetch failed with status ${response.status}: ${url}`,
        baseUrl,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ValidationError(`Invalid JSON in agent card response from ${url}`);
    }

    return this.validate(body, baseUrl);
  }

  private validate(body: unknown, agentUrl: string): AgentCard {
    if (!body || typeof body !== 'object') {
      throw new ValidationError(`Agent card from ${agentUrl} is not a valid object`);
    }

    const card = body as Record<string, unknown>;

    if (!card.name || typeof card.name !== 'string') {
      throw new ValidationError(`Agent card from ${agentUrl} missing required field: name`);
    }
    if (!card.url || typeof card.url !== 'string') {
      throw new ValidationError(`Agent card from ${agentUrl} missing required field: url`);
    }
    if (!Array.isArray(card.skills)) {
      throw new ValidationError(`Agent card from ${agentUrl} missing required field: skills`);
    }

    return card as unknown as AgentCard;
  }
}
