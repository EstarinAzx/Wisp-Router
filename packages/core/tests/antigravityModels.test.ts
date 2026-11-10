// --------- antigravityModels.test.ts — live model discovery: /v1internal:fetchAvailableModels --------- //

/*
 * The upstream answers a `models` MAP keyed by model id (not an array), with per-row
 * {displayName, maxTokens, maxOutputTokens} — the shape the reference's own fetch tool parses
 * (CLIProxyAPI cmd/fetch_antigravity_models). The payload also carries editor-internal rows
 * (tab-completion models, numbered chat experiments) that are not servable chat models; the
 * parser drops them on SHAPE (`tab_*` prefix, `chat_<digits>`), never by pinned id — the same
 * rule as the usage payload's unstable codenames.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAntigravityModels } from '../src/antigravityClient';
import {
  parseAntigravityModels, ANTIGRAVITY_DAILY_HOST, ANTIGRAVITY_PROD_HOST, ANTIGRAVITY_HTTP_USER_AGENT,
  type AntigravityCreds,
} from '../src/catalog';

// ----------------------------- Fixture — the reference-documented answer shape ----------------------------- //

const MODELS_PAYLOAD = {
  models: {
    'gemini-3.1-pro-low': { displayName: 'Gemini 3.1 Pro (Low)', maxTokens: 1_048_576, maxOutputTokens: 65_535 },
    'claude-sonnet-4-6': { displayName: 'Claude Sonnet 4.6', maxOutputTokens: 64_000 },
    'gemini-4-flash': { displayName: 'Gemini 4 Flash' },
    'chat_20706': { displayName: 'chat_20706' },
    'tab_flash_lite_preview': { displayName: 'tab_flash_lite_preview' },
  },
  webSearchModelIds: ['gemini-3.1-pro-low'],
};

const creds = (over: Partial<AntigravityCreds> = {}): AntigravityCreds =>
  ({ accessToken: 'test-token', projectId: 'example-project-1', ...over });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { url: string; init: RequestInit };

// Same harness as antigravityClient.test.ts: queue of answers, every attempt recorded.
const stubFetch = (answers: Response[]): Call[] => {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return answers[Math.min(n++, answers.length - 1)];
  });
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

// ----------------------------- The pure parser ----------------------------- //

describe('parseAntigravityModels', () => {
  it('reads the models map keys, sorted', () => {
    expect(parseAntigravityModels(MODELS_PAYLOAD)).toEqual(['claude-sonnet-4-6', 'gemini-3.1-pro-low', 'gemini-4-flash']);
  });

  it('drops editor-internal rows on shape: tab_* and chat_<digits>', () => {
    const ids = parseAntigravityModels(MODELS_PAYLOAD);
    expect(ids).not.toContain('chat_20706');
    expect(ids).not.toContain('tab_flash_lite_preview');
  });

  it('keeps a chat-named row that is not a numbered experiment', () => {
    expect(parseAntigravityModels({ models: { 'chat-bison': {} } })).toEqual(['chat-bison']);
  });

  it('answers empty on a payload without a models map', () => {
    expect(parseAntigravityModels({})).toEqual([]);
    expect(parseAntigravityModels(undefined)).toEqual([]);
    expect(parseAntigravityModels({ models: [] })).toEqual([]);
  });
});

// ----------------------------- The outbound request ----------------------------- //

describe('fetchAntigravityModels — the outbound request', () => {
  it('POSTs the account catalog with the shared Hub headers and no legacy project filter', async () => {
    const calls = stubFetch([jsonResponse(MODELS_PAYLOAD)]);
    const ids = await fetchAntigravityModels(creds());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ANTIGRAVITY_DAILY_HOST}/v1internal:fetchAvailableModels`);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
      'User-Agent': ANTIGRAVITY_HTTP_USER_AGENT,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({});
    expect(ids).toEqual(['claude-sonnet-4-6', 'gemini-3.1-pro-low', 'gemini-4-flash']);
  });

  it('sends an empty object when the bundle has no project — discovery works before the bootstrap', async () => {
    const calls = stubFetch([jsonResponse(MODELS_PAYLOAD)]);
    await fetchAntigravityModels(creds({ projectId: undefined }));
    expect(JSON.parse(String(calls[0].init.body))).toEqual({});
  });

  it('throws without an access token', async () => {
    await expect(fetchAntigravityModels(creds({ accessToken: undefined }))).rejects.toThrow(/not signed in/i);
  });
});

// ----------------------------- The host chain ----------------------------- //

describe('fetchAntigravityModels — the host chain', () => {
  it('falls to production when daily fails, and answers from it', async () => {
    const calls = stubFetch([jsonResponse({ error: 'nope' }, 500), jsonResponse(MODELS_PAYLOAD)]);
    const ids = await fetchAntigravityModels(creds());
    expect(calls.map((c) => c.url)).toEqual([
      `${ANTIGRAVITY_DAILY_HOST}/v1internal:fetchAvailableModels`,
      `${ANTIGRAVITY_PROD_HOST}/v1internal:fetchAvailableModels`,
    ]);
    expect(ids).toEqual(['claude-sonnet-4-6', 'gemini-3.1-pro-low', 'gemini-4-flash']);
  });

  it('surfaces the last host error in the API-error contract shape when every host fails', async () => {
    stubFetch([jsonResponse({ error: 'nope' }, 500), jsonResponse({ error: 'still no' }, 503)]);
    await expect(fetchAntigravityModels(creds())).rejects.toThrow(/Antigravity API error 503/);
  });

  it('a configured non-default base URL pins the chain to itself', async () => {
    const calls = stubFetch([jsonResponse({ error: 'nope' }, 500)]);
    await expect(fetchAntigravityModels(creds(), 'https://example.test')).rejects.toThrow(/Antigravity API error 500/);
    expect(calls.map((c) => c.url)).toEqual(['https://example.test/v1internal:fetchAvailableModels']);
  });
});
