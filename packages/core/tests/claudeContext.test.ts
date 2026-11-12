import { describe, expect, it } from 'vitest';
import {
  createClaudeContextProfile, signClaudeContext, readClaudeContext, resolveClaudeContextRoute,
  validateClaudeContextTarget, readClaudeContextWindow,
} from '../src/claudeContext';
import type { Provider } from '../src/catalog';

const provider: Provider = { id: 'xai', label: 'Grok', baseUrl: 'https://cli-chat-proxy.grok.com/v1',
  defaultModel: 'grok-build', apiKeyEnv: '', kind: 'xai-oauth' };
const map = { families: {}, aliases: [{ name: 'carbon', target: { providerId: 'xai', model: 'grok-4.5' } }] };
const state = { providers: [provider], map, activeProviderId: 'xai', modelMap: {}, customBaseUrl: '' };
const profile = () => createClaudeContextProfile('carbon', resolveClaudeContextRoute('carbon', state), { contextWindow: 500000, source: 'catalogue' });

describe('Claude launch context profiles', () => {
  it.each([128000, 400000, 500000, 1000000])('preserves the exact %i window and verifies the signed profile', contextWindow => {
    const value = createClaudeContextProfile('carbon', resolveClaudeContextRoute('carbon', state), { contextWindow, source: 'catalogue' });
    expect(value.contextWindow).toBe(contextWindow);
    expect(value.id).toMatch(/^wisp\/claude-ctx-[a-f0-9]{24}$/);
    expect(readClaudeContext(signClaudeContext(value, 'secret'), 'secret')).toEqual(value);
  });

  it('rejects tampering, other secrets, malformed data and oversized headers', () => {
    const token = signClaudeContext(profile(), 'secret');
    expect(() => readClaudeContext(token, 'other')).toThrow();
    expect(() => readClaudeContext(token.slice(0, -1) + 'z', 'secret')).toThrow();
    for (const bad of ['', 'invalid', 'x'.repeat(20000)]) expect(() => readClaudeContext(bad, 'secret')).toThrow();
    for (const bad of [0, -1, NaN, 1.5, Infinity, 10000001]) {
      expect(() => createClaudeContextProfile('carbon', resolveClaudeContextRoute('carbon', state), { contextWindow: bad, source: 'catalogue' })).toThrow();
    }
  });

  it('resolves the pinned alias rather than the active provider model and never silently falls back', () => {
    expect(resolveClaudeContextRoute('claude-wisp-carbon', state)).toMatchObject({ target: { providerId: 'xai', model: 'grok-4.5' }, route: 'carbon' });
    expect(resolveClaudeContextRoute(undefined, state)).toMatchObject({ target: { providerId: 'xai', model: 'grok-build' }, route: 'xai' });
    expect(() => resolveClaudeContextRoute('missing', state)).toThrow();
    expect(() => resolveClaudeContextRoute('opus', state)).toThrow();
    expect(resolveClaudeContextRoute('opus', { ...state, map: { ...map, families: { opus: map.aliases[0].target } } })).toMatchObject({ target: map.aliases[0].target });
  });

  it('rejects different targets, route deletion and base-URL changes before generation', () => {
    const current = profile();
    expect(() => validateClaudeContextTarget(current, current.id, state)).not.toThrow();
    expect(() => validateClaudeContextTarget(current, 'claude-opus-5', state)).toThrow(/relaunch/i);
    expect(() => validateClaudeContextTarget(current, current.id, { ...state, map: { families: {}, aliases: [] } })).toThrow();
    expect(() => validateClaudeContextTarget(current, current.id, { ...state, map: { ...map, aliases: [{ name: 'carbon', target: { providerId: 'xai', model: 'grok-build' } }] } })).toThrow(/relaunch/i);
    expect(() => validateClaudeContextTarget(current, current.id, { ...state, providers: [{ ...provider, baseUrl: 'https://changed.example' }] })).toThrow(/relaunch/i);
  });

  it('uses account metadata for subscription models and labels missing limits conservatively', async () => {
    const readers = { codex: async () => ({ id: 'target', contextWindow: 272000, maxContextWindow: 872000 }),
      antigravity: async () => ({ id: 'target', contextWindow: 1048576 }), catalogue: async () => ({ contextInput: 500000 }) };
    expect(await readClaudeContextWindow({ ...provider, kind: 'codex' }, 'target', readers)).toEqual({ contextWindow: 872000, source: 'account' });
    expect(await readClaudeContextWindow({ ...provider, kind: 'antigravity-oauth' }, 'target', readers)).toEqual({ contextWindow: 1048576, source: 'account' });
    expect(await readClaudeContextWindow(provider, 'grok-4.7', readers)).toEqual({ contextWindow: 500000, source: 'catalogue' });
    expect(await readClaudeContextWindow(provider, 'unknown-future-model', { catalogue: async () => undefined })).toEqual({ contextWindow: 128000, source: 'fallback' });
    expect(await readClaudeContextWindow(provider, 'grok-4.5', { catalogue: async () => undefined })).toEqual({ contextWindow: 500000, source: 'curated' });
    expect(await readClaudeContextWindow({ ...provider, kind: 'antigravity-oauth' }, 'target', { antigravity: async () => ({ id: 'other', contextWindow: 1000000 }) })).toEqual({ contextWindow: 128000, source: 'fallback' });
  });

  it('retains a known curated window when the optional public catalogue rejects', async () => {
    expect(await readClaudeContextWindow(provider, 'grok-4.5', { catalogue: async () => { throw new Error('offline'); } }))
      .toEqual({ contextWindow: 500000, source: 'curated' });
  });
});
