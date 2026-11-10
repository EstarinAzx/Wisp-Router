import { describe, expect, it, vi } from 'vitest';
import { requestGeminiInteraction } from '../src/geminiInteractionsClient';
import { GeminiInteractionError, type GeminiInteractionArgs } from '../src/geminiInteractions';

const apiKey = 'PRIVATE_API_KEY';
const signature = 'PRIVATE_SIGNATURE';
const request: GeminiInteractionArgs = { model: 'gemini-4-argon', input: [
  { type: 'user_input', content: [{ type: 'text', text: 'PRIVATE_PROMPT' }] },
], systemInstruction: 'PRIVATE_POLICY', effort: 'high', maxOutputTokens: 100,
tools: [{ name: 'lookup', description: 'Find a value', inputSchema: { type: 'object' } }] };
const payload = { status: 'requires_action', steps: [
  { type: 'thought', signature, summary: [{ type: 'text', text: 'Synthetic summary.' }] },
  { type: 'function_call', id: 'original_A', name: 'lookup', arguments: { n: 1 } },
  { type: 'thought', signature: 'second signature' },
  { type: 'function_call', id: 'original_B', name: 'lookup', arguments: { n: 2 } },
] };
const safeError = async (result: Promise<unknown>, expected: object) => {
  const error = await result.then(() => { throw Error('Expected refusal'); }, error => error);
  expect(error).toBeInstanceOf(GeminiInteractionError);
  expect(error).toMatchObject(expected);
  expect(`${error}\n${error.stack}\n${JSON.stringify(error)}`).not.toMatch(/PRIVATE_|second signature/);
  expect(error.cause).toBeUndefined();
};

describe('single stateless Gemini request', () => {
  it('POSTs exactly once to beta with the supplied signal/key and complete stateless body', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(payload));
    const signal = new AbortController().signal;
    const result = await requestGeminiInteraction({ request, apiKey, signal, fetch });
    expect(result).toEqual(payload);
    expect(result).not.toHaveProperty('usage');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(init).toMatchObject({ method: 'POST', signal, redirect: 'manual' });
    expect(Object.fromEntries(new Headers(init?.headers).entries())).toEqual({ 'x-goog-api-key': apiKey, 'content-type': 'application/json' });
    expect(JSON.parse(init!.body as string)).toEqual({ model: 'gemini-4-argon', input: request.input,
      system_instruction: 'PRIVATE_POLICY', generation_config: { thinking_level: 'high', max_output_tokens: 100 },
      tools: [{ type: 'function', name: 'lookup', description: 'Find a value', parameters: { type: 'object' } }],
      stream: false, store: false, background: false });
  });

  it('keeps usage optional and accepts independently provided partial counts', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ status: 'completed', steps: [], usage: { total_output_tokens: 7 } }));
    expect(await requestGeminiInteraction({ request, apiKey, fetch })).toEqual({ status: 'completed', steps: [], usage: { total_output_tokens: 7 } });
  });

  it('makes zero calls for pre-abort, invalid input and invalid credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await safeError(requestGeminiInteraction({ request, apiKey, fetch, signal: AbortSignal.abort('PRIVATE_REASON') }), { code: 'aborted' });
    for (const key of ['', ' ', 'bad\r\nPRIVATE_KEY', 'bad\u0000key', 'ékey']) {
      await safeError(requestGeminiInteraction({ request, apiKey: key, fetch }), { code: 'auth' });
    }
    for (const invalid of [{ ...request, model: 'gemini-4-argon-high' }, { ...request, temperature: 0.1 },
      { ...request, input: [...request.input, ...payload.steps] }]) {
      await safeError(requestGeminiInteraction({ request: invalid as GeminiInteractionArgs, apiKey, fetch }), { code: 'invalid_request' });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses unknown transport options before any request instead of silently ignoring an override', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(payload));
    const args = { request, apiKey, fetch, endpoint: 'https://example.invalid/PRIVATE_ENDPOINT' };
    await safeError(requestGeminiInteraction(args), { code: 'invalid_request' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([301, 302, 307, 308, 400, 401, 403, 429, 500, 503])('does not follow or retry HTTP %s and cancels its unread body', async status => {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('PRIVATE_ERROR PRIVATE_SIGNATURE')); }, cancel() { cancelled = true; } });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body, { status,
      headers: { location: 'https://example.invalid/PRIVATE_KEY', 'retry-after': '3' } }));
    await safeError(requestGeminiInteraction({ request, apiKey, fetch }), { code: 'http', status, retryAfterMs: 3000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(true);
  });

  it.each([
    ['0', 0], ['1.5', 1500], ['-1', undefined], ['Infinity', undefined], ['1e6', undefined], ['', undefined], ['PRIVATE_HEADER', undefined],
    ['Wed, 18 May 2033 03:33:40 GMT', 20000],
  ] as const)('only returns safe numeric Retry-After guidance from %s', async (header, retryAfterMs) => {
    vi.spyOn(Date, 'now').mockReturnValue(2000000000000);
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('PRIVATE_ERROR', { status: 429, headers: { 'retry-after': header } }));
      await safeError(requestGeminiInteraction({ request, apiKey, fetch }), { code: 'http', status: 429, retryAfterMs });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.restoreAllMocks(); }
  });

  it('refuses a redirected response even if it claims HTTP success', async () => {
    const response = Response.json(payload);
    Object.defineProperty(response, 'redirected', { value: true });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
    await safeError(requestGeminiInteraction({ request, apiKey, fetch }), { code: 'http', status: 200 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a safe transport error without retrying or attaching the original error', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw Error(`${apiKey} ${signature} PRIVATE_URL`); });
    await safeError(requestGeminiInteraction({ request, apiKey, fetch }), { code: 'network' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PRIVATE_INVALID_JSON', 'invalid_response'],
    [JSON.stringify({ ...payload, status: 'incomplete' }), 'incomplete'],
    [JSON.stringify({ ...payload, status: 'failed', errors: [{ message: 'PRIVATE_ERROR' }] }), 'failed'],
    [JSON.stringify({ ...payload, steps: [...payload.steps, { type: 'future', secret: signature }] }), 'invalid_response'],
    [JSON.stringify({ ...payload, steps: [...payload.steps, payload.steps[1]] }), 'invalid_response'],
    [JSON.stringify({ ...payload, usage: { total_tokens: -1 } }), 'invalid_response'],
  ])('never delivers tools from an invalid complete document', async (body, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body));
    await safeError(requestGeminiInteraction({ request, apiKey, fetch }), { code });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes cancellation to fetch and suppresses the abort reason', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(Error('PRIVATE_REASON')), { once: true });
    }));
    const result = requestGeminiInteraction({ request, apiKey, fetch, signal: controller.signal });
    controller.abort('PRIVATE_REASON');
    await safeError(result, { code: 'aborted' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['headers', 'body'])('discards a successful response completing after abort during %s', async stage => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      const response = Response.json(payload);
      if (stage === 'headers') controller.abort('PRIVATE_REASON');
      else response.json = async () => { controller.abort('PRIVATE_REASON'); return payload; };
      return response;
    });
    await safeError(requestGeminiInteraction({ request, apiKey, fetch, signal: controller.signal }), { code: 'aborted' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('checks cancellation again after asynchronous response cleanup, before delivering calls', async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream({ cancel: async () => {
      await Promise.resolve();
      controller.abort('PRIVATE_REASON');
    } }));
    response.json = async () => payload;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
    await safeError(requestGeminiInteraction({ request, apiKey, fetch, signal: controller.signal }), { code: 'aborted' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retains an observed HTTP retry deadline when abort races the error response', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      controller.abort('PRIVATE_REASON');
      return new Response('PRIVATE_ERROR', { status: 429, headers: { 'retry-after': '60' } });
    });
    await safeError(requestGeminiInteraction({ request, apiKey, fetch, signal: controller.signal }), { code: 'http', status: 429, retryAfterMs: 60000 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
