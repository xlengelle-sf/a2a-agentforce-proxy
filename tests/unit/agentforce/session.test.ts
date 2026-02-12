import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentforceSession } from '../../../src/agentforce/client/session.js';
import { UpstreamError } from '../../../src/shared/errors.js';

describe('AgentforceSession', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let session: AgentforceSession;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    session = new AgentforceSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('creates a session and returns sessionId', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'sess-123' }), { status: 200 }),
      );

      const id = await session.create('token', 'https://my.sf.com', 'agent-1');

      expect(id).toBe('sess-123');
      expect(fetchSpy).toHaveBeenCalledOnce();

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://api.salesforce.com/einstein/ai-agent/v1/agents/agent-1/sessions',
      );
      expect(opts?.method).toBe('POST');
      expect(opts?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer token' }),
      );

      const body = JSON.parse(opts?.body as string);
      expect(body.bypassUser).toBe(true);
      expect(body.instanceConfig.endpoint).toBe('https://my.sf.com');
      expect(body.streamingCapabilities.chunkTypes).toEqual(['Text']);
      expect(body.externalSessionKey).toBeDefined();
    });

    it('throws UpstreamError on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Internal Error', { status: 500 }),
      );

      await expect(
        session.create('token', 'https://my.sf.com', 'agent-1'),
      ).rejects.toThrow(UpstreamError);
    });

    it('throws UpstreamError when sessionId is missing from response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      await expect(
        session.create('token', 'https://my.sf.com', 'agent-1'),
      ).rejects.toThrow(UpstreamError);
    });
  });

  describe('delete', () => {
    it('deletes a session successfully', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await session.delete('token', 'sess-123');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://api.salesforce.com/einstein/ai-agent/v1/sessions/sess-123',
      );
      expect(opts?.method).toBe('DELETE');
    });

    it('does not throw on non-OK delete (best effort)', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      // Should not throw — delete is best-effort
      await expect(session.delete('token', 'sess-gone')).resolves.toBeUndefined();
    });
  });
});
