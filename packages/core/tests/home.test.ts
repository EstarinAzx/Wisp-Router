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
  parseWispConfig, parseWispAuth, serializeWispStore, isUnusableStore,
  planSecretsMigration, seedConfigFromVsCode, effectiveAliasOnly,
  type WispAuth, type WispConfig,
} from '../src/home';

// ----------------------------- isUnusableStore ----------------------------- //

// #182: the parsers flatten "absent" and "corrupt" into the same {}, which is safe to READ and catastrophic
// to write back. This predicate is the bit they throw away — the one the store layer needs to tell the two
// apart before it overwrites anything.
describe('isUnusableStore', () => {
  test('content we could not understand is unusable', () => {
    expect(isUnusableStore('{ not json')).toBe(true);
    expect(isUnusableStore('{"a":1,')).toBe(true);   // truncated write
    expect(isUnusableStore('"a string"')).toBe(true); // valid JSON, not a store
    expect(isUnusableStore('[1,2]')).toBe(true);
    expect(isUnusableStore('null')).toBe(true);
  });

  test('absent or blank is NOT unusable — there is nothing there to lose', () => {
    expect(isUnusableStore(undefined)).toBe(false);
    expect(isUnusableStore(null)).toBe(false);
    expect(isUnusableStore('')).toBe(false);
    expect(isUnusableStore('  \n\t ')).toBe(false);
  });

  test('a readable store is usable, BOM and all (#181 stays fixed)', () => {
    expect(isUnusableStore('{"provider":"codex"}')).toBe(false);
    expect(isUnusableStore('﻿{"provider":"codex"}')).toBe(false);
    expect(isUnusableStore('{}')).toBe(false);
  });
});

// ----------------------------- parseWispConfig ----------------------------- //

describe('parseWispConfig', () => {
  test('Antigravity client fallback only accepts an explicit boolean', () => {
    for (const value of [true, false, 'true', 'false', 1, null]) {
      const cfg = parseWispConfig(JSON.stringify({ bridge: { antigravityClientFallback: value, port: 4242 } }));
      expect(cfg.bridge).toEqual({ port: 4242, ...(typeof value === 'boolean' ? { antigravityClientFallback: value } : {}) });
    }
  });

  test('missing, empty, corrupt, or non-object input parses as the empty config', () => {
    expect(parseWispConfig(undefined)).toEqual({});
    expect(parseWispConfig('')).toEqual({});
    expect(parseWispConfig('{ not json')).toEqual({});
    expect(parseWispConfig('"a string"')).toEqual({});
    expect(parseWispConfig('[1,2]')).toEqual({});
    expect(parseWispConfig('null')).toEqual({});
  });

  // A UTF-8 BOM is valid UTF-8 and is what Notepad and PowerShell 5.1's `Out-File -Encoding utf8` write
  // by default, so a hand-edited config arrives with one routinely. JSON.parse rejects it, which used to
  // sink the ENTIRE config to {} above every field guard — and because writeConfig is read-merge-write,
  // the next settings change then persisted that {} over the user's real file (#181).
  test('a leading UTF-8 BOM is tolerated, not treated as corruption', () => {
    const cfg: WispConfig = { provider: 'codex', effort: 'high' };
    expect(parseWispConfig('﻿' + serializeWispStore(cfg))).toEqual(cfg);
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
      effort: 42,
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

// ----------------------------- effectiveAliasOnly ----------------------------- //

describe('effectiveAliasOnly', () => {
  // The shared read-time default (#81): unset means ON — never a migration write. Every consumer
  // (Bridge list, TUI echo, panel checkbox) reads through this one fn so they can't disagree.
  test('unset resolves to on', () => {
    expect(effectiveAliasOnly({})).toBe(true);
    expect(effectiveAliasOnly({ bridge: {} })).toBe(true);
  });

  // An explicit stored false is a user choice — the default flip must not override it.
  test('stored explicit false stays off', () => {
    expect(effectiveAliasOnly({ bridge: { aliasOnlyModels: false } })).toBe(false);
  });

  test('stored explicit true stays on', () => {
    expect(effectiveAliasOnly({ bridge: { aliasOnlyModels: true } })).toBe(true);
  });
});

// ----------------------------- parseWispAuth ----------------------------- //

describe('parseWispAuth', () => {
  test('missing or corrupt input parses as the empty auth', () => {
    expect(parseWispAuth(undefined)).toEqual({});
    expect(parseWispAuth('oops{')).toEqual({});
    expect(parseWispAuth('123')).toEqual({});
  });

  // Same trap as the config side, higher stakes: auth.json holds every API key and OAuth bundle (#181).
  test('a leading UTF-8 BOM is tolerated, not treated as corruption', () => {
    const auth: WispAuth = { keys: { groq: 'gk-123' }, bridgeSecret: 'sec' };
    expect(parseWispAuth('﻿' + serializeWispStore(auth))).toEqual(auth);
  });

  test('valid fields survive a parse round-trip', () => {
    const auth: WispAuth = {
      keys: { groq: 'gk-123', 'opencode-go': 'oc-456' },
      codex: { accessToken: 'at', refreshToken: 'rt', accountId: 'acc' },
      anthropic: { accessToken: 'at2', refreshToken: 'rt2', expiresAt: 1234 },
      xai: { accessToken: 'at3', refreshToken: 'rt3', expiresAt: 5678, tokenEndpoint: 'https://auth.x.ai/token' },
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

  test('the anthropic identity fields (#150) survive the round-trip; wrong-typed ones drop', () => {
    const anthropic = {
      accessToken: 'at', deviceId: 'ab'.repeat(32), accountUuid: 'u-1',
      accountEmail: 'you@x.com', organizationName: 'Org', rateLimitTier: 'default_claude_max_20x',
    };
    expect(parseWispAuth(JSON.stringify({ anthropic }))).toEqual({ anthropic });
    expect(parseWispAuth(JSON.stringify({ anthropic: { accessToken: 'at', deviceId: 7, accountUuid: null } })))
      .toEqual({ anthropic: { accessToken: 'at' } });
  });

  test('the xai slot sanitizes like its twins — string bearer/endpoint, numeric expiry, tombstone kept (#92)', () => {
    // A number in a Bearer field or a string in the expiry compare must be dropped; the endpoint stays a string.
    const raw = JSON.stringify({ xai: { accessToken: 'at', refreshToken: 42, expiresAt: 'later', tokenEndpoint: 'https://auth.x.ai/token' } });
    expect(parseWispAuth(raw)).toEqual({ xai: { accessToken: 'at', tokenEndpoint: 'https://auth.x.ai/token' } });
    // The `{}` sign-out tombstone survives (suppresses the ~/.grok/auth.json re-import), like codex/anthropic.
    expect(parseWispAuth(JSON.stringify({ xai: {} }))).toEqual({ xai: {} });
  });

  test('the antigravity slot round-trips its four fields, projectId included (#188)', () => {
    const antigravity = { accessToken: 'ya29.a', refreshToken: '1//rt', expiresAt: 9012, projectId: 'example-project-1' };
    expect(parseWispAuth(JSON.stringify({ antigravity }))).toEqual({ antigravity });
  });

  test('the antigravity slot sanitizes like its twins, and keeps the tombstone (#188)', () => {
    // A number in a Bearer field or a string in the expiry compare must be dropped; projectId stays a string.
    const raw = JSON.stringify({ antigravity: { accessToken: 'ya29.a', refreshToken: 42, expiresAt: 'later', projectId: 'p-1' } });
    expect(parseWispAuth(raw)).toEqual({ antigravity: { accessToken: 'ya29.a', projectId: 'p-1' } });
    expect(parseWispAuth(JSON.stringify({ antigravity: {} }))).toEqual({ antigravity: {} });
  });

  // The allowlist is the point, not decoration: sanitizeCreds keeps only KNOWN fields, so a hand-edited or
  // reference-shaped bundle cannot smuggle extra state (the reference's per-email multi-account map is
  // explicitly not adopted — a stray `accounts` key must not survive into the store).
  test('the antigravity slot drops fields outside its allowlist (#188)', () => {
    const raw = JSON.stringify({
      antigravity: { accessToken: 'ya29.a', projectId: 'p-1', accounts: { 'you@x.com': { accessToken: 'other' } }, email: 'you@x.com' },
    });
    expect(parseWispAuth(raw)).toEqual({ antigravity: { accessToken: 'ya29.a', projectId: 'p-1' } });
  });

  // #182 / ADR-0004 holds for the new slice too: an unparseable store is never OVERWRITTEN, and the guard
  // that decides so is isUnusableStore, not the parser. A truncated auth.json holding an antigravity bundle
  // must still read as unusable so homeStore.merge refuses rather than erasing it.
  test('a truncated store carrying the antigravity slice still reads as unusable (#182)', () => {
    expect(isUnusableStore('{"antigravity":{"accessToken":"ya29.a"')).toBe(true);
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
