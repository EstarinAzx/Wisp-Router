import { describe, expect, it, vi } from 'vitest';
import { fetchAccountQuota, type QuotaProvider } from '../src/index';

const now = 2000000000000;
const creds = { accessToken: 'PRIVATE_TOKEN', accountId: 'PRIVATE_ACCOUNT' };
const codexPayload = { email: 'PRIVATE_EMAIL', rate_limit: {
  primary_window: { used_percent: 42, limit_window_seconds: 18000, reset_after_seconds: 100, reset_at: 2000000000 },
  secondary_window: null,
} };
const anthropicPayload = { limits: [{ kind: 'session', group: 'session', scope: null,
  percent: 42, resets_at: '2033-05-18T03:33:20Z', severity: 'normal', is_active: true }] };
const run = (provider: QuotaProvider, response: Response) => {
  const request = vi.fn<typeof fetch>(async () => response);
  return { request, result: fetchAccountQuota(provider, creds, { now, signal: new AbortController().signal, request }) };
};

describe('fetchAccountQuota', () => {
  it.each(['anthropic', 'codex'] as const)('sends %s credentials once to its fixed endpoint and returns only meters', async provider => {
    const request = vi.fn<typeof fetch>(async () => Response.json(provider === 'anthropic' ? anthropicPayload : codexPayload));
    const signal = new AbortController().signal;
    const result = await fetchAccountQuota(provider, creds, { now, signal, request });
    expect(result).toEqual({ ok: true, meters: [{ label: '5h', percent: 42, resetAt: 2000000000 }] });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(provider === 'anthropic' ? 'https://api.anthropic.com/api/oauth/usage' : 'https://chatgpt.com/backend-api/wham/usage');
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', signal });
    expect(init?.body).toBeUndefined();
    expect(Object.fromEntries(new Headers(init?.headers).entries())).toEqual(provider === 'anthropic'
      ? { authorization: 'Bearer PRIVATE_TOKEN', 'anthropic-beta': 'oauth-2025-04-20' }
      : { authorization: 'Bearer PRIVATE_TOKEN', 'chatgpt-account-id': 'PRIVATE_ACCOUNT' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });

  it.each([401, 403, 429, 500, 503, 302, 307, 308])('classifies HTTP %s without returning prose or following redirects', async status => {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('PRIVATE_UPSTREAM_ERROR')); }, cancel() { cancelled = true; } });
    const { request, result } = run('codex', new Response(body, { status, headers: { location: 'https://example.invalid/PRIVATE_ACCOUNT' } }));
    expect(await result).toEqual({ ok: false, code: status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate_limited' : 'unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(true);
  });

  it.each([
    ['600', 600000], ['1.5', 1500], ['0', 0],
    ['Wed, 18 May 2033 03:33:40 GMT', 20000], ['Tue, 17 May 2033 03:33:20 GMT', 0],
    ['', undefined], ['-1', undefined], ['1e6', undefined], ['Infinity', undefined], ['PRIVATE_HEADER', undefined],
  ] as const)('normalizes Retry-After %s to a nonnegative duration', async (header, retryAfterMs) => {
    const { request, result } = run('anthropic', new Response('PRIVATE_ERROR', { status: 429, headers: { 'retry-after': header } }));
    expect(await result).toEqual({ ok: false, code: 'rate_limited', ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('preserves a retry deadline on non-429 failures too', async () => {
    const { result } = run('codex', new Response('PRIVATE_ERROR', { status: 503, headers: { 'retry-after': '600' } }));
    expect(await result).toEqual({ ok: false, code: 'unavailable', retryAfterMs: 600000 });
  });

  it('rejects unknown and invalid successful payloads rather than fabricating zero usage', async () => {
    for (const payload of [null, {}, { rate_limit: { primary_window: null } }, { tangelo: { utilization: 42 } }]) {
      const { request, result } = run('codex', Response.json(payload));
      expect(await result).toEqual({ ok: false, code: 'invalid_response' });
      expect(request).toHaveBeenCalledTimes(1);
    }
    const { result } = run('anthropic', new Response('PRIVATE_INVALID_JSON'));
    expect(await result).toEqual({ ok: false, code: 'invalid_response' });
  });

  it('does no IO for absent credentials or a cancelled action', async () => {
    const request = vi.fn<typeof fetch>();
    const signal = new AbortController().signal;
    for (const accessToken of ['', '   ', 'bad\r\ntoken']) {
      expect(await fetchAccountQuota('anthropic', { accessToken }, { now, signal, request })).toEqual({ ok: false, code: 'auth' });
    }
    expect(await fetchAccountQuota('codex', { accessToken: creds.accessToken }, { now, signal, request })).toEqual({ ok: false, code: 'auth' });
    expect(await fetchAccountQuota('codex', { ...creds, accountId: ' ' }, { now, signal, request })).toEqual({ ok: false, code: 'auth' });
    const aborted = AbortSignal.abort('PRIVATE_CANCEL_REASON');
    expect(await fetchAccountQuota('anthropic', creds, { now, signal: aborted, request })).toEqual({ ok: false, code: 'unavailable' });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the caller signal to cancel the one request without retry or error leakage', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Error('PRIVATE_TOKEN PRIVATE_ACCOUNT')), { once: true });
    }));
    const result = fetchAccountQuota('codex', creds, { now, signal: controller.signal, request });
    controller.abort();
    expect(await result).toEqual({ ok: false, code: 'unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not accept a payload that finishes after cancellation', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async () => { controller.abort(); return Response.json(codexPayload); });
    expect(await fetchAccountQuota('codex', creds, { now, signal: controller.signal, request })).toEqual({ ok: false, code: 'unavailable' });
  });

  it('retains an observed retry deadline when cancellation races the error response', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async () => {
      controller.abort();
      return new Response('PRIVATE_ERROR', { status: 429, headers: { 'retry-after': '600' } });
    });
    expect(await fetchAccountQuota('codex', creds, { now, signal: controller.signal, request }))
      .toEqual({ ok: false, code: 'rate_limited', retryAfterMs: 600000 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns a static unavailable result for transport errors', async () => {
    const request = vi.fn<typeof fetch>(async () => { throw new Error('PRIVATE_TOKEN PRIVATE_ACCOUNT PRIVATE_NETWORK_URL'); });
    expect(await fetchAccountQuota('anthropic', creds, { now, signal: new AbortController().signal, request }))
      .toEqual({ ok: false, code: 'unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
