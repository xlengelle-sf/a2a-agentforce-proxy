import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentCardResolver } from '../../../src/a2a/client/agent-card-resolver.js';

const VALID_CARD = {
  name: 'Test Agent',
  description: 'A test agent',
  url: 'https://test-agent.example.com/a2a',
  version: '0.3.0',
  capabilities: { streaming: false, pushNotifications: false },
  authentication: { schemes: ['bearer'] },
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [{ id: 'test', name: 'Test', description: 'Test skill' }],
};

describe('AgentCardResolver', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch and return a valid agent card', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_CARD), { status: 200 })),
    );

    const resolver = new AgentCardResolver();
    const card = await resolver.resolve('https://test-agent.example.com');

    expect(card.name).toBe('Test Agent');
    expect(card.url).toBe('https://test-agent.example.com/a2a');
    expect(card.skills).toHaveLength(1);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-agent.example.com/.well-known/agent-card.json',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should normalize trailing slash on agent URL', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_CARD), { status: 200 })),
    );

    const resolver = new AgentCardResolver();
    await resolver.resolve('https://test-agent.example.com///');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-agent.example.com/.well-known/agent-card.json',
      expect.any(Object),
    );
  });

  it('should use cached card on second call within TTL', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_CARD), { status: 200 })),
    );

    const resolver = new AgentCardResolver({ ttlMs: 60_000 });

    const card1 = await resolver.resolve('https://test-agent.example.com');
    const card2 = await resolver.resolve('https://test-agent.example.com');

    expect(card1).toStrictEqual(card2);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Only one fetch
  });

  it('should re-fetch after TTL expires', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_CARD), { status: 200 })),
    );

    const resolver = new AgentCardResolver({ ttlMs: 10 }); // 10ms TTL

    await resolver.resolve('https://test-agent.example.com');

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 20));

    await resolver.resolve('https://test-agent.example.com');

    expect(fetchSpy).toHaveBeenCalledTimes(2); // Two fetches
  });

  it('should re-fetch after cache is invalidated', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_CARD), { status: 200 })),
    );

    const resolver = new AgentCardResolver({ ttlMs: 60_000 });

    await resolver.resolve('https://test-agent.example.com');
    resolver.invalidateCache('https://test-agent.example.com');
    await resolver.resolve('https://test-agent.example.com');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should throw UpstreamError on HTTP 404', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response('Not Found', { status: 404 })),
    );

    const resolver = new AgentCardResolver();

    await expect(resolver.resolve('https://missing.example.com'))
      .rejects.toThrow(/status 404/);
  });

  it('should throw UpstreamError on network failure', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.reject(new TypeError('fetch failed')),
    );

    const resolver = new AgentCardResolver();

    await expect(resolver.resolve('https://down.example.com'))
      .rejects.toThrow(/Failed to fetch agent card/);
  });

  it('should throw ValidationError on invalid JSON', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response('not json at all', { status: 200 })),
    );

    const resolver = new AgentCardResolver();

    await expect(resolver.resolve('https://bad.example.com'))
      .rejects.toThrow(/Invalid JSON/);
  });

  it('should throw ValidationError when required fields are missing', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ description: 'no name or url' }), { status: 200 })),
    );

    const resolver = new AgentCardResolver();

    await expect(resolver.resolve('https://incomplete.example.com'))
      .rejects.toThrow(/missing required field: name/);
  });

  it('should throw ValidationError when skills is missing', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ name: 'Test', url: 'https://x.com' }),
          { status: 200 },
        ),
      ),
    );

    const resolver = new AgentCardResolver();

    await expect(resolver.resolve('https://no-skills.example.com'))
      .rejects.toThrow(/missing required field: skills/);
  });

  it('should throw UpstreamError on timeout', async () => {
    fetchSpy.mockImplementation((_url, init) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response(JSON.stringify(VALID_CARD), { status: 200 })),
          500,
        );

        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const resolver = new AgentCardResolver({ timeoutMs: 50 });

    await expect(resolver.resolve('https://slow.example.com'))
      .rejects.toThrow(/timed out/);
  });
});
