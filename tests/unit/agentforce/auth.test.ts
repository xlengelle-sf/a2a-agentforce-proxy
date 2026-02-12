import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentforceAuth } from '../../../src/agentforce/client/auth.js';
import { AuthenticationError } from '../../../src/shared/errors.js';

const VALID_TOKEN_RESPONSE = {
  access_token: 'test-access-token',
  instance_url: 'https://my.salesforce.com',
  id: 'https://login.salesforce.com/id/00D/005',
  token_type: 'Bearer',
  issued_at: '1700000000000',
  signature: 'sig==',
};

function makeAuth(overrides?: { tokenTtlMs?: number }) {
  return new AgentforceAuth({
    serverUrl: 'test.my.salesforce.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    clientEmail: 'test@example.com',
    ...overrides,
  });
}

describe('AgentforceAuth', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a token on first call', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(VALID_TOKEN_RESPONSE), { status: 200 }),
    );

    const auth = makeAuth();
    const token = await auth.getToken();

    expect(token.accessToken).toBe('test-access-token');
    expect(token.instanceUrl).toBe('https://my.salesforce.com');
    expect(fetchSpy).toHaveBeenCalledOnce();

    // Verify the request was correct
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://test.my.salesforce.com/services/oauth2/token');
    expect(opts?.method).toBe('POST');
    expect(opts?.body).toContain('grant_type=client_credentials');
    expect(opts?.body).toContain('client_email=test%40example.com');
  });

  it('returns cached token on second call', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(VALID_TOKEN_RESPONSE), { status: 200 }),
    );

    const auth = makeAuth();
    await auth.getToken();
    const token2 = await auth.getToken();

    expect(token2.accessToken).toBe('test-access-token');
    expect(fetchSpy).toHaveBeenCalledOnce(); // no second fetch
  });

  it('refreshes token after TTL expires', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_TOKEN_RESPONSE), { status: 200 })),
    );

    const auth = makeAuth({ tokenTtlMs: 1 }); // 1ms TTL
    await auth.getToken();

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));

    await auth.getToken();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refresh calls', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(VALID_TOKEN_RESPONSE), { status: 200 }),
    );

    const auth = makeAuth();

    // Fire 3 concurrent getToken calls — should result in a single fetch
    const [t1, t2, t3] = await Promise.all([
      auth.getToken(),
      auth.getToken(),
      auth.getToken(),
    ]);

    expect(t1.accessToken).toBe('test-access-token');
    expect(t2.accessToken).toBe('test-access-token');
    expect(t3.accessToken).toBe('test-access-token');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('forceRefresh bypasses the cache', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_TOKEN_RESPONSE), { status: 200 })),
    );

    const auth = makeAuth();
    await auth.getToken();
    await auth.forceRefresh();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws AuthenticationError on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"invalid_client"}', { status: 401 }),
    );

    const auth = makeAuth();
    await expect(auth.getToken()).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError on 400', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 }),
    );

    const auth = makeAuth();
    await expect(auth.getToken()).rejects.toThrow(AuthenticationError);
  });
});
