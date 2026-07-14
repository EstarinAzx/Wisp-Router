// ----------------- home.test.ts — Wisp home store: schema + migration pures ----------------- //

/*
 * Depends on:
 *   - vitest: test runner.
 *   - ./home: the pures under test — parse/serialize/defaulting for config.json + auth.json,
 *     the one-time SecretStorage→auth.json migration mapping, and the config seed mapping.
 *
 * Data shapes:
 *   - WispConfig / WispAuth (from ./home): the two store files' parsed forms.
 */

import { describe, expect, test } from 'vitest';
import {
  parseWispConfig, parseWispAuth, serializeWispStore,
  planSecretsMigration, seedConfigFromVsCode,
  type WispAuth, type WispConfig,
} from './home';

// ----------------------------- parseWispConfig ----------------------------- //

describe('parseWispConfig', () => {
  test('missing, empty, corrupt, or non-object input parses as the empty config', () => {
    expect(parseWispConfig(undefined)).toEqual({});
    expect(parseWispConfig('')).toEqual({});
    expect(parseWispConfig('{ not json')).toEqual({});
    expect(parseWispConfig('"a string"')).toEqual({});
    expect(parseWispConfig('[1,2]')).toEqual({});
    expect(parseWispConfig('null')).toEqual({});
  });

  test('valid fields survive a parse round-trip', () => {
    const cfg: WispConfig = {
      provider: 'groq',
      models: { groq: 'llama-3.3-70b-versatile', codex: 'gpt-5.3-codex' },
      effort: 'xhigh',
      routing: { families: { opus: { providerId: 'anthropic', model: 'claude-opus-4-8' } }, aliases: [{ name: 'fast', target: { providerId: 'groq', model: 'llama' } }] },
      customBaseUrl: 'https://my.proxy/v1',
      bridge: { port: 4242, aliasPickerShowsModel: false, aliasOnlyModels: true },
    };
    expect(parseWispConfig(serializeWispStore(cfg))).toEqual(cfg);
  });

  test('wrong-typed fields are dropped so downstream defaulting applies', () => {
    const raw = JSON.stringify({
      provider: 42,
      models: 'nope',
      effort: 'bogus',
      routing: { families: 'nope' },
      customBaseUrl: [],
      bridge: { port: 'high', aliasPickerShowsModel: 'yes', aliasOnlyModels: 'sure' },
    });
    expect(parseWispConfig(raw)).toEqual({ bridge: {} });
  });

  test('non-string entries inside models are dropped entry-by-entry', () => {
    const raw = JSON.stringify({ models: { groq: 'llama', bad: 7 } });
    expect(parseWispConfig(raw)).toEqual({ models: { groq: 'llama' } });
  });

  test('unknown top-level keys are preserved (a TUI-era field must survive an extension rewrite)', () => {
    const raw = JSON.stringify({ provider: 'groq', tuiTheme: 'dark' });
    const cfg = parseWispConfig(raw);
    expect((cfg as Record<string, unknown>).tuiTheme).toBe('dark');
    expect(parseWispConfig(serializeWispStore(cfg))).toEqual(cfg);
  });
});

// ----------------------------- parseWispAuth ----------------------------- //

describe('parseWispAuth', () => {
  test('missing or corrupt input parses as the empty auth', () => {
    expect(parseWispAuth(undefined)).toEqual({});
    expect(parseWispAuth('oops{')).toEqual({});
    expect(parseWispAuth('123')).toEqual({});
  });

  test('valid fields survive a parse round-trip', () => {
    const auth: WispAuth = {
      keys: { groq: 'gk-123', 'opencode-go': 'oc-456' },
      codex: { accessToken: 'at', refreshToken: 'rt', accountId: 'acc' },
      anthropic: { accessToken: 'at2', refreshToken: 'rt2', expiresAt: 1234 },
      bridgeSecret: 'sec',
    };
    expect(parseWispAuth(serializeWispStore(auth))).toEqual(auth);
  });

  test('wrong-typed fields are dropped, non-string key entries entry-by-entry', () => {
    const raw = JSON.stringify({ keys: { groq: 'gk', bad: 1 }, codex: 'nope', anthropic: [], bridgeSecret: 9 });
    expect(parseWispAuth(raw)).toEqual({ keys: { groq: 'gk' } });
  });

  test('an empty creds object is preserved — it is the signed-out tombstone, not garbage', () => {
    expect(parseWispAuth(JSON.stringify({ codex: {} }))).toEqual({ codex: {} });
  });

  test('wrong-typed fields INSIDE a creds bundle are dropped (hand-edited auth.json must not reach the wire)', () => {
    const raw = JSON.stringify({
      codex: { accessToken: 123, refreshToken: 'rt', idToken: null, accountId: 'acc' },
      anthropic: { accessToken: 'at', expiresAt: 'soon' },
    });
    expect(parseWispAuth(raw)).toEqual({
      codex: { refreshToken: 'rt', accountId: 'acc' },
      anthropic: { accessToken: 'at' },
    });
  });
});

// ----------------------------- serializeWispStore ----------------------------- //

describe('serializeWispStore', () => {
  test('pretty-prints with two-space indent and a trailing newline (the file is hand-editable)', () => {
    const out = serializeWispStore({ provider: 'groq' });
    expect(out).toBe('{\n  "provider": "groq"\n}\n');
  });
});

// ----------------------------- planSecretsMigration ----------------------------- //

describe('planSecretsMigration', () => {
  test('nothing in SecretStorage → null (second launch is a no-op)', () => {
    expect(planSecretsMigration({ auth: {}, slots: { keys: {} } })).toBeNull();
    expect(planSecretsMigration({ auth: { keys: { groq: 'kept' } }, slots: { keys: {} } })).toBeNull();
  });

  test('populated slots land in an empty auth', () => {
    const next = planSecretsMigration({
      auth: {},
      slots: {
        keys: { groq: 'gk-1', 'opencode-go': 'oc-2' },
        codexRaw: JSON.stringify({ accessToken: 'cat', refreshToken: 'crt' }),
        anthropicRaw: JSON.stringify({ accessToken: 'aat', expiresAt: 99 }),
        bridgeSecret: 'bsec',
      },
    });
    expect(next).toEqual({
      keys: { groq: 'gk-1', 'opencode-go': 'oc-2' },
      codex: { accessToken: 'cat', refreshToken: 'crt' },
      anthropic: { accessToken: 'aat', expiresAt: 99 },
      bridgeSecret: 'bsec',
    });
  });

  test('existing auth values are never clobbered by stale slots', () => {
    const next = planSecretsMigration({
      auth: { keys: { groq: 'fresh' }, codex: { accessToken: 'fresh-c' }, bridgeSecret: 'fresh-s' },
      slots: { keys: { groq: 'stale', mistral: 'mk' }, codexRaw: JSON.stringify({ accessToken: 'stale-c' }), bridgeSecret: 'stale-s' },
    });
    expect(next).toEqual({
      keys: { groq: 'fresh', mistral: 'mk' },
      codex: { accessToken: 'fresh-c' },
      bridgeSecret: 'fresh-s',
    });
  });

  test('a sign-out tombstone ({}) migrates as-is so it keeps suppressing the CLI auth.json import', () => {
    const next = planSecretsMigration({ auth: {}, slots: { keys: {}, codexRaw: '{}' } });
    expect(next).toEqual({ codex: {} });
  });

  test('corrupt creds JSON and blank keys are skipped, not copied', () => {
    // Only garbage present → nothing worth writing → null.
    expect(planSecretsMigration({ auth: {}, slots: { keys: { groq: '   ' }, codexRaw: 'gar{bage' } })).toBeNull();
    // Garbage next to a real key → the real key still migrates.
    const next = planSecretsMigration({ auth: {}, slots: { keys: { groq: 'gk', bad: ' ' }, anthropicRaw: 'nope[' } });
    expect(next).toEqual({ keys: { groq: 'gk' } });
  });
});

// ----------------------------- seedConfigFromVsCode ----------------------------- //

describe('seedConfigFromVsCode', () => {
  test('a full snapshot maps onto the config shape', () => {
    expect(seedConfigFromVsCode({
      provider: 'codex',
      models: { codex: 'gpt-5.3-codex' },
      effort: 'high',
      routing: { families: {}, aliases: [] },
      customBaseUrl: 'https://x/v1',
      bridgePort: 5000,
      aliasPickerShowsModel: true,
    })).toEqual({
      provider: 'codex',
      models: { codex: 'gpt-5.3-codex' },
      effort: 'high',
      routing: { families: {}, aliases: [] },
      customBaseUrl: 'https://x/v1',
      bridge: { port: 5000, aliasPickerShowsModel: true },
    });
  });

  test('undefined fields are omitted entirely — a fresh install seeds an empty config', () => {
    expect(seedConfigFromVsCode({})).toEqual({});
    expect(seedConfigFromVsCode({ provider: 'groq' })).toEqual({ provider: 'groq' });
  });
});
