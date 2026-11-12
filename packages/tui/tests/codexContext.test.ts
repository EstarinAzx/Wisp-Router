import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PROVIDERS, type WispConfig } from '@wisp/core';
import { aliasDescriptor, mergeAliasCatalog, mergeDesktopCatalog, readAliasCapabilities } from '../src/codexCatalog';

const originalHome = process.env.WISP_HOME;
const homes: string[] = [];
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
beforeEach(() => { fetchSpy = spyOn(globalThis, 'fetch'); });
afterEach(() => {
  fetchSpy.mockRestore();
  if (originalHome === undefined) delete process.env.WISP_HOME;
  else process.env.WISP_HOME = originalHome;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
const configFor = (models: string[], providerId = 'antigravity'): WispConfig => ({
  routing: { families: {}, aliases: models.map((model, i) => ({ name: `alias-${i}`, target: { providerId, model } })) },
});
const rowsFor = async (config: WispConfig, token?: string) => mergeAliasCatalog({ models: [] }, config,
  await readAliasCapabilities(config, token ? { antigravity: { accessToken: token } } : {})).models;

test('Antigravity account limits reach aliases and exact Codex routes without broadening effort or vision', async () => {
  const models = ['gemini-4-carbon-high', 'gemini-4-argon-high', 'gemini-3.8-flash-tiered'];
  const config = configFor(models);
  config.customBaseUrl = 'https://wrong.invalid';
  config.routing!.codexModels = { native: { providerId: 'antigravity', model: models[0] } };
  const calls: { url: string; authorization: string | null }[] = [];
  fetchSpy.mockImplementation(async (url, init) => {
    calls.push({ url: String(url), authorization: new Headers(init?.headers).get('authorization') });
    return Response.json({ models: Object.fromEntries(models.map((model, i) => [model, { maxTokens: [1048576, 500000, 200000][i], supportsImages: true }])) });
  });
  const capabilities = await readAliasCapabilities(config, { antigravity: { accessToken: 'synthetic-account-a' } });
  const native = { models: [{ slug: 'native', context_window: 272000, max_context_window: 872000 }] };
  const catalog = mergeAliasCatalog(native, config, capabilities);
  expect(catalog.models.map(row => row.context_window)).toEqual([1048576, 1048576, 500000, 200000]);
  expect(catalog.models.map(row => row.max_context_window)).toEqual([1048576, 1048576, 500000, 200000]);
  expect(catalog.models.every(row => JSON.stringify(row.input_modalities) === '["text"]')).toBe(true);
  expect(catalog.models[1].supported_reasoning_levels).toEqual([]);
  expect(catalog.models[2].default_reasoning_level).toBe('high');
  expect(catalog.models[3].default_reasoning_level).toBe('medium');
  expect(calls).toEqual([{ url: `${PROVIDERS.find(p => p.id === 'antigravity')!.baseUrl}/v1internal:fetchAvailableModels`, authorization: 'Bearer synthetic-account-a' }]);
  const desktop = mergeDesktopCatalog(native, config, capabilities, true);
  expect(desktop.catalog.models[0]).toEqual(native.models[0]);
  expect(desktop.catalog.models.slice(1).map(row => row.context_window)).toEqual([500000, 200000]);
  expect(desktop.excludedTargets).toContainEqual({ name: 'alias-0', kind: 'alias', reason: expect.stringContaining('not validated') });
  expect(desktop.catalog.models.slice(1).every(row => JSON.stringify(row.input_modalities) === '["text"]')).toBe(true);
  expect(mergeDesktopCatalog(native, config, capabilities).catalog.models).toEqual(native.models);
});

test('Antigravity metadata stays within the supplied account and signed-out calls make no lookup', async () => {
  const config = configFor(['gemini-4-carbon-high']);
  fetchSpy.mockImplementation(async (_url, init) => Response.json({ models: {
    'gemini-4-carbon-high': { maxTokens: new Headers(init?.headers).get('authorization') === 'Bearer account-a' ? 1048576 : 200000 },
  } }));
  expect((await rowsFor(config, 'account-a'))[0].context_window).toBe(1048576);
  expect((await rowsFor(config, 'account-b'))[0].context_window).toBe(200000);
  fetchSpy.mockImplementation(async () => { throw new Error('Signed-out lookup must not run'); });
  expect((await rowsFor(config))[0].context_window).toBeNull();
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('missing, invalid and failed Antigravity metadata never invents a context window', async () => {
  const models = ['missing', 'zero', 'negative', 'fraction', 'string', 'unsafe', 'gemini-4-argon-high'];
  const config = configFor(models);
  fetchSpy.mockImplementation(async () => Response.json({ models: {
    zero: { maxTokens: 0 }, negative: { maxTokens: -1 }, fraction: { maxTokens: 1.5 },
    string: { maxTokens: '1048576' }, unsafe: { maxTokens: Number.MAX_SAFE_INTEGER + 1 },
    'gemini-4-argon-high': {},
  } }));
  let rows = await rowsFor(config, 'synthetic');
  expect(rows.map(row => row.context_window)).toEqual(models.map(() => null));
  expect(rows.at(-1)!.default_reasoning_level).toBe('high');
  for (const response of [() => Promise.reject(new Error('offline')), () => Promise.resolve(new Response('unavailable', { status: 503 })),
    () => Promise.resolve(new Response('not json')), () => Promise.resolve(Response.json({ models: [] }))]) {
    fetchSpy.mockImplementation(response);
    rows = await rowsFor(config, 'synthetic');
    expect(rows.map(row => row.max_context_window)).toEqual(models.map(() => null));
    expect(rows.at(-1)!.default_reasoning_level).toBe('high');
  }
});

test('Codex keeps the account default separate from its maximum and isolates account caches', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wisp-context-')); homes.push(home); process.env.WISP_HOME = home;
  const config = configFor(['account-model'], 'codex');
  fetchSpy.mockImplementation(async (url, init) => String(url).includes('registry.npmjs.org') ? Response.json({ version: '0.167.1' }) : Response.json({ models: [{
    slug: 'account-model', visibility: 'list', context_window: 272000,
    max_context_window: new Headers(init?.headers).get('chatgpt-account-id') === 'account-a' ? 872000 : 400000,
  }] }));
  for (const [accountId, maximum] of [['account-a', 872000], ['account-b', 400000]] as const) {
    const caps = await readAliasCapabilities(config, { codex: { accessToken: 'synthetic', accountId } });
    expect(mergeAliasCatalog({ models: [] }, config, caps).models[0]).toMatchObject({ context_window: 272000, max_context_window: maximum });
  }
  const signedOut = await readAliasCapabilities(config, {});
  expect(mergeAliasCatalog({ models: [] }, config, signedOut).models[0].context_window).toBeNull();
});

test('unknown or invalid limits stay null in native descriptors', () => {
  for (const contextInput of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(aliasDescriptor('unknown', 'fixture', { contextInput })).toMatchObject({ context_window: null, max_context_window: null });
  }
});

test('optional Antigravity discovery releases startup within four seconds and retains fixed effort', async () => {
  const cleanup = new AbortController();
  const calls: string[] = [];
  fetchSpy.mockImplementation((url, init) => new Promise<Response>((_resolve, reject) => {
    calls.push(String(url));
    const signal = AbortSignal.any([init!.signal!, cleanup.signal]);
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = rowsFor(configFor(['gemini-4-argon-high']), 'synthetic');
  try {
    const rows = await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Optional discovery exceeded its startup budget')), 4500);
    })]);
    expect(rows[0]).toMatchObject({ context_window: null, default_reasoning_level: 'high' });
    expect(calls).toHaveLength(1);
  } finally {
    clearTimeout(timer); cleanup.abort(); await pending;
  }
}, 6000);
