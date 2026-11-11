// ---------------- codexModels.test.ts — discovery contracts and the request that consumes them ---------------- //

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodexModelCatalog, codexModelIds, parseCodexModels } from '../src/codexModels';
import { codexModelCaps, codexReasoning, codexEffortOptions } from '../src/codex';
import { codexStream } from '../src/codexClient';
import { buildStatus } from '../src/status';
import { anthropicThinkingEffort } from '../src/anthropic';
import { xaiReasoning } from '../src/xai';
import { parseWispConfig } from '../src/home';

const dirs: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const row = (slug = 'nebula-next-nano', fields = {}) => ({
  slug, display_name: slug, visibility: 'list', supported_in_api: false,
  supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'max' }, { effort: 'future-depth' }],
  default_reasoning_level: 'medium', default_reasoning_summary: 'none',
  input_modalities: ['text'], context_window: 345_000, max_context_window: 999_000, ...fields,
});
const info = () => parseCodexModels({ models: [row()] })[0];
const creds = { accessToken: 'test-bearer', accountId: 'test-account' };
const args = { creds, baseUrl: 'https://codex.example/backend-api/codex' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const harness = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-codex-models-')); dirs.push(dir);
  let now = 1_000_000;
  const request = vi.fn<typeof fetch>().mockImplementation(async (url) =>
    String(url).includes('registry.npmjs.org') ? json({ version: '0.200.0' }) : json({ models: [row()] }));
  const catalog = new CodexModelCatalog(() => dir, request, () => now);
  return { dir, request, catalog, advance: () => { now += 16 * 60_000; }, now: () => now };
};

describe('Codex model metadata', () => {
  it('accepts new families and formerly excluded suffixes, using visibility rather than API-key flags', () => {
    const rows = ['gpt-6-astra', 'unknown-pro', 'new-chat-latest', 'next-deep-research', 'new-nano'].map((id) => row(id));
    rows.push(row('internal', { visibility: 'hide' }));
    expect(codexModelIds(parseCodexModels({ models: rows }))).toEqual(rows.slice(0, -1).map((m) => m.slug));
  });
  it('retains hidden metadata for explicitly selected models without promoting them into the picker', () => {
    const models = parseCodexModels({ models: [row('hidden', { visibility: 'hide' })] });
    expect(codexModelIds(models)).toEqual([]);
    expect(models[0].reasoningEfforts).toContain('max');
  });
  it('rejects malformed envelopes, model ids, and duplicate ids', () => {
    for (const body of [{}, { models: [null] }, { models: [{ slug: '' }] }, { models: [row(), row()] }]) {
      expect(() => parseCodexModels(body)).toThrow('Invalid Codex model catalogue');
    }
  });
  it('does not copy credentials or upstream prompt instructions into cacheable metadata', () => {
    expect(JSON.stringify(parseCodexModels({ models: [row('future', { accessToken: 'secret', instructions: 'do something' })] })))
      .not.toMatch(/secret|instructions|do something/);
  });
  it('honours arbitrary advertised efforts and summary metadata', () => {
    expect(codexReasoning(info().id, 'future-depth', info())).toEqual({ effort: 'future-depth' });
    expect(codexReasoning(info().id, 'max', { ...info(), reasoningSummary: 'detailed' })).toEqual({ effort: 'max', summary: 'detailed' });
    expect(codexReasoning(info().id, 'max', info())?.effort).toBe('max');
  });
  it('uses the advertised default for an unsupported preference', () => {
    expect(codexReasoning(info().id, 'xhigh', info())?.effort).toBe('medium');
  });
  it('does not advertise or send Codex runtime Ultra as a Responses reasoning effort', () => {
    const model = { ...info(), reasoningEfforts: ['low', 'medium', 'max', 'ultra'] };
    expect(codexEffortOptions(model)).toEqual(['low', 'medium', 'max']);
    expect(codexReasoning(model.id, 'ultra', model)).toEqual({ effort: 'medium' });
  });
  it('does not infer reasoning support from a familiar name or an unknown manual id', () => {
    expect(codexReasoning('gpt-5.6-sol', 'high')).toBeUndefined();
    expect(codexReasoning('manual-model', 'max')).toBeUndefined();
    const noReasoning = parseCodexModels({ models: [row('gpt-6-next', { supported_reasoning_levels: [] })] })[0];
    expect(codexReasoning(noReasoning.id, 'max', noReasoning)).toBeUndefined();
  });
  it('uses the served context window and modalities, with no generation-based guesses', () => {
    expect(codexModelCaps(info().id, info())).toEqual({ contextInput: 345_000, vision: false });
    expect(codexModelCaps('gpt-6-next')).toEqual({});
  });
  it('retains the maximum separately and bounds an explicit context override to it', () => {
    const model = parseCodexModels({ models: [row('gpt-6-astra', { context_window: 272000, max_context_window: 872000 })] })[0];
    expect(model).toMatchObject({ contextWindow: 272000, maxContextWindow: 872000 });
    expect(codexModelCaps(model.id, model).contextInput).toBe(272000);
    expect(codexModelCaps(model.id, model, 1000000).contextInput).toBe(872000);
    expect(codexModelCaps(model.id, model, 512000).contextInput).toBe(512000);
    expect(codexModelCaps(model.id, model, 128000).contextInput).toBe(128000);
  });
  it('rejects invalid overrides and never expands a stale catalogue with no maximum', () => {
    const model = parseCodexModels({ models: [row('gpt-6-astra', { context_window: 272000, max_context_window: undefined })] })[0];
    for (const override of [undefined, 0, -1, NaN, Infinity, 1.2, '1000000', {}, 1000000]) {
      expect(codexModelCaps(model.id, model, override).contextInput).toBe(272000);
    }
    expect(codexModelCaps('another-model', model, 1000000)).toEqual({});
    expect(codexModelCaps('manual-model', undefined, 1000000)).toEqual({});
  });
  it('persists a future effort and keeps it off unrelated providers', () => {
    expect(parseWispConfig('{"effort":"future-depth"}').effort).toBe('future-depth');
    expect(anthropicThinkingEffort('claude-opus-5', 'future-depth').output_config?.effort).toBe('medium');
    expect(xaiReasoning('grok-4', 'future-depth')?.effort).toBe('medium');
  });
  it('uses discovered context in Bridge status without inventing an offline Codex window', () => {
    const provider = { id: 'codex', label: 'Codex', kind: 'codex' as const, baseUrl: '', defaultModel: '', apiKeyEnv: '' };
    const usage = { input_tokens: 34_500, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    expect(buildStatus({ now: 1, provider, model: info().id, usage, contextWindow: info().contextWindow }).contextPercent).toBe(10);
    expect(buildStatus({ now: 1, provider, model: info().id, usage }).contextWindow).toBeUndefined();
  });
});

describe('Codex model discovery and persistence', () => {
  it('retains the maximum through the account-scoped disk cache', async () => {
    const h = harness(); await h.catalog.get(args);
    const offline = new CodexModelCatalog(() => h.dir, async () => { throw new Error('offline'); }, h.now);
    expect((await offline.get(args)).models[0]).toMatchObject({ contextWindow: 345000, maxContextWindow: 999000 });
  });
  it('authenticates only the catalogue request, and uses OpenAI package metadata for the client version', async () => {
    const h = harness(); const result = await h.catalog.get(args);
    expect(result.source).toBe('live');
    expect(h.request.mock.calls[0][1]?.headers).toBeUndefined();
    expect(String(h.request.mock.calls[1][0])).toBe(`${args.baseUrl}/models?client_version=0.200.0`);
    expect(h.request.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer test-bearer', 'chatgpt-account-id': 'test-account' });
    const raw = readFileSync(join(h.dir, readdirSync(h.dir)[0]), 'utf8');
    expect(raw).not.toMatch(/test-bearer|test-account/);
  });
  it('shares concurrent refreshes and serves fresh disk cache across instances without network IO', async () => {
    const h = harness();
    await Promise.all([h.catalog.get(args), h.catalog.get(args)]);
    expect(h.request).toHaveBeenCalledTimes(2);
    const second = new CodexModelCatalog(() => h.dir, h.request, h.now);
    expect((await second.get(args)).source).toBe('cache');
    expect(h.request).toHaveBeenCalledTimes(2);
  });
  it('refreshes on expiry and discovers a newly advertised model and client version', async () => {
    const h = harness(); await h.catalog.get(args); h.advance();
    h.request.mockImplementation(async (url) => String(url).includes('registry.npmjs.org')
      ? json({ version: '0.201.0' }) : json({ models: [row('completely-new-variant')] }));
    expect(codexModelIds((await h.catalog.get(args)).models)).toEqual(['completely-new-variant']);
    expect(String(h.request.mock.calls.at(-1)?.[0])).toContain('client_version=0.201.0');
  });
  it('allows an explicit refresh inside the normal TTL', async () => {
    const h = harness(); await h.catalog.get(args); await h.catalog.get({ ...args, refresh: true });
    expect(h.request).toHaveBeenCalledTimes(4);
  });
  it('keeps the saved account catalogue on failures, limits retry frequency, and lets refresh retry immediately', async () => {
    const h = harness(); await h.catalog.get(args); h.advance();
    h.request.mockRejectedValue(new Error('offline'));
    expect(await h.catalog.get(args)).toMatchObject({ source: 'cache', models: [info()], error: 'offline' });
    const calls = h.request.mock.calls.length;
    await h.catalog.get(args); expect(h.request).toHaveBeenCalledTimes(calls);
    await h.catalog.get({ ...args, refresh: true }); expect(h.request.mock.calls.length).toBeGreaterThan(calls);
  });
  it('uses the cached client version when package metadata is temporarily unavailable', async () => {
    const h = harness(); await h.catalog.get(args); h.advance();
    h.request.mockImplementation(async (url) => {
      if (String(url).includes('registry.npmjs.org')) throw Error('offline');
      return json({ models: [row('fresh-model')] });
    });
    expect((await h.catalog.get(args)).source).toBe('live');
    expect(String(h.request.mock.calls.at(-1)?.[0])).toContain('client_version=0.200.0');
  });
  it('does not share catalogues between accounts or endpoints, or use a signed-out cache', async () => {
    const h = harness(); await h.catalog.get(args); h.request.mockRejectedValue(Error('offline'));
    expect((await h.catalog.get({ ...args, creds: { ...creds, accountId: 'second-account' } })).models).toEqual([]);
    expect((await h.catalog.get({ ...args, baseUrl: 'https://different.example/codex' })).models).toEqual([]);
    expect((await h.catalog.get({ ...args, creds: {} })).models).toEqual([]);
  });
  it('accepts an authoritative empty list instead of resurrecting older models', async () => {
    const h = harness(); await h.catalog.get(args);
    h.request.mockImplementation(async (url) => String(url).includes('registry.npmjs.org') ? json({ version: '0.201.0' }) : json({ models: [] }));
    expect(await h.catalog.get({ ...args, refresh: true })).toMatchObject({ source: 'live', models: [] });
    expect((await h.catalog.get(args)).models).toEqual([]);
  });
  it('does not overwrite a working catalogue with malformed upstream JSON', async () => {
    const h = harness(); await h.catalog.get(args);
    h.request.mockImplementation(async (url) => String(url).includes('registry.npmjs.org') ? json({ version: '0.201.0' }) : json({ unexpected: [] }));
    expect(await h.catalog.get({ ...args, refresh: true })).toMatchObject({ source: 'cache', models: [info()] });
    expect((await h.catalog.get(args)).models).toEqual([info()]);
  });
  it('reports status without echoing credential-shaped upstream error bodies', async () => {
    const h = harness();
    h.request.mockImplementation(async (url) => String(url).includes('registry.npmjs.org') ? json({ version: '0.200.0' }) : json({ error: 'test-bearer' }, 401));
    const result = await h.catalog.get(args);
    expect(result.error).toBe('Codex model discovery failed (HTTP 401).');
  });
  it('recovers from a corrupt regenerable cache and leaves no temporary files', async () => {
    const h = harness(); await h.catalog.get(args);
    writeFileSync(join(h.dir, readdirSync(h.dir)[0]), '{broken');
    expect((await h.catalog.get(args)).source).toBe('live');
    expect(readdirSync(h.dir)).toHaveLength(1);
  });
});

describe('Codex request consumes model metadata', () => {
  it('sends a new id, advertised effort, summary and tools through the existing Responses stream', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('event: response.completed\ndata: {"response":{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}}\n\n'));
    vi.stubGlobal('fetch', request);
    const model = info();
    const output = [];
    for await (const e of codexStream({ ...args, model: model.id, modelInfo: model, effort: 'future-depth', messages: [{ role: 'user', content: 'hi' }] })) output.push(e);
    const sent = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(sent.model).toBe('nebula-next-nano');
    expect(sent.reasoning).toEqual({ effort: 'future-depth' });
    expect(String(request.mock.calls[0][0])).toBe(`${args.baseUrl}/responses`);
    expect(output).toContainEqual({ type: 'text', value: 'OK' });
  });
});
