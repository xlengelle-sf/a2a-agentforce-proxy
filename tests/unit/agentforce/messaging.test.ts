import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentforceMessaging } from '../../../src/agentforce/client/messaging.js';
import { UpstreamError } from '../../../src/shared/errors.js';

const VALID_RESPONSE = {
  messages: [
    {
      id: 'msg-1',
      type: 'Text',
      message: 'Hello! How can I help you?',
      feedbackId: 'fb-1',
      planId: 'plan-1',
    },
  ],
};

describe('AgentforceMessaging', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let messaging: AgentforceMessaging;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    messaging = new AgentforceMessaging();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a message and parses the response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );

    const result = await messaging.send('token', 'sess-1', 1, 'Hi there');

    expect(result.text).toBe('Hello! How can I help you?');
    expect(result.feedbackId).toBe('fb-1');
    expect(result.planId).toBe('plan-1');
    expect(result.raw).toEqual(VALID_RESPONSE);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://api.salesforce.com/einstein/ai-agent/v1/sessions/sess-1/messages',
    );
    expect(opts?.method).toBe('POST');

    const body = JSON.parse(opts?.body as string);
    expect(body.message.sequenceId).toBe(1);
    expect(body.message.type).toBe('Text');
    expect(body.message.text).toBe('Hi there');
  });

  it('throws UpstreamError on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(messaging.send('bad-token', 'sess-1', 1, 'Hi')).rejects.toThrow(
      UpstreamError,
    );
  });

  it('throws UpstreamError when messages array is empty', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );

    await expect(messaging.send('token', 'sess-1', 1, 'Hi')).rejects.toThrow(
      UpstreamError,
    );
  });

  it('throws UpstreamError when messages is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await expect(messaging.send('token', 'sess-1', 1, 'Hi')).rejects.toThrow(
      UpstreamError,
    );
  });

  it('handles multi-message response (takes first)', async () => {
    const multiResponse = {
      messages: [
        { id: 'msg-1', type: 'Text', message: 'First' },
        { id: 'msg-2', type: 'Text', message: 'Second' },
      ],
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(multiResponse), { status: 200 }),
    );

    const result = await messaging.send('token', 'sess-1', 1, 'Hi');
    expect(result.text).toBe('First');
  });

  it('throws UpstreamError on timeout', async () => {
    const slowMessaging = new AgentforceMessaging({ timeoutMs: 50 });

    fetchSpy.mockImplementationOnce(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve(new Response('ok', { status: 200 })),
            200,
          );
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    await expect(slowMessaging.send('token', 'sess-1', 1, 'Hi')).rejects.toThrow(
      UpstreamError,
    );
  });
});
