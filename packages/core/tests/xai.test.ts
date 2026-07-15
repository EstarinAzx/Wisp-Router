// ---------------- xai.test.ts — pure Grok (xAI OAuth) Provider helpers ---------------- //

import { describe, it, expect } from 'vitest';
import {
  isXaiProvider, isXaiSignedIn,
  tokensToXaiCreds, shouldRefreshXaiToken, parseXaiCreds,
  xaiModelCaps, xaiModelsFrom, XAI_MODELS,
  parseGrokAuthJson, isXaiEndpoint,
  effortOptionsFor, oauthModelOptions,
  type Provider,
} from '../src/catalog';

// A Grok catalog row, overridable per-test — mirrors the anthropic.test.ts provider() helper.
const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'xai', label: 'Grok', baseUrl: 'https://cli-chat-proxy.grok.com/v1',
  defaultModel: 'grok-build', apiKeyEnv: '', kind: 'xai-oauth', ...over,
});

describe('isXaiProvider', () => {
  it('is true for a row whose kind is xai-oauth', () => {
    expect(isXaiProvider(provider())).toBe(true);
  });

  // Grok must stay distinct from every other kind — especially the codex-twin kind it clones, and the
  // API-key Groq row (absent kind == openai-chat) it is forever confused with.
  it('is false for absent kind, openai-chat, codex, and anthropic-oauth', () => {
    expect(isXaiProvider(provider({ kind: undefined }))).toBe(false);
    expect(isXaiProvider(provider({ kind: 'openai-chat' }))).toBe(false);
    expect(isXaiProvider(provider({ kind: 'codex' }))).toBe(false);
    expect(isXaiProvider(provider({ kind: 'anthropic-oauth' }))).toBe(false);
  });
});

describe('isXaiSignedIn', () => {
  // Grok has no API key — usable == a bearer access token is present.
  it('is true when an access token is present', () => {
    expect(isXaiSignedIn({ accessToken: 'at', refreshToken: 'rt' })).toBe(true);
  });

  // A `{}` sign-out tombstone and a refresh-only blob both read as signed-out.
  it('is false for undefined, the tombstone, and a bearer-less blob', () => {
    expect(isXaiSignedIn(undefined)).toBe(false);
    expect(isXaiSignedIn({})).toBe(false);
    expect(isXaiSignedIn({ refreshToken: 'rt' })).toBe(false);
  });
});

describe('tokensToXaiCreds', () => {
  // xAI returns expires_in (seconds, relative); the deadline is computed at exchange time and stored as an
  // absolute epoch-ms expiresAt against the injected clock — mirrors tokensToAnthropicCreds.
  it('computes expiresAt from expires_in against the supplied clock', () => {
    expect(tokensToXaiCreds({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }, 1000))
      .toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1000 + 3_600_000 });
  });

  // No expires_in → no expiresAt key (time-based refresh never fires; a live 401 still recovers).
  it('omits expiresAt when expires_in is absent', () => {
    expect(tokensToXaiCreds({ access_token: 'at', refresh_token: 'rt' }, 1000))
      .toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });
});

describe('shouldRefreshXaiToken', () => {
  const now = 1_000_000_000_000; // fixed clock so the 2-minute skew window is deterministic

  // Refresh once the token is within 2 minutes of expiry (xAI's skew, tighter than Anthropic's 5), so it
  // can't die mid-request.
  it('is true when expiry is inside the 2-minute skew window', () => {
    expect(shouldRefreshXaiToken({ expiresAt: now + 60_000 }, now)).toBe(true);
  });

  // The boundary is inclusive — exactly 2 minutes out still refreshes.
  it('is true exactly at the 2-minute boundary', () => {
    expect(shouldRefreshXaiToken({ expiresAt: now + 2 * 60_000 }, now)).toBe(true);
  });

  it('is false when expiry is well past the skew window', () => {
    expect(shouldRefreshXaiToken({ expiresAt: now + 3_600_000 }, now)).toBe(false);
  });

  // No deadline → can't prove staleness, so don't force a refresh that might block a working token.
  it('is false when there is no expiresAt', () => {
    expect(shouldRefreshXaiToken({}, now)).toBe(false);
  });
});

describe('parseXaiCreds', () => {
  // A corrupt slot reads as "no creds" rather than throwing — the read path must never crash sign-in state.
  it('returns undefined for absent, empty, and non-JSON slots', () => {
    expect(parseXaiCreds(undefined)).toBeUndefined();
    expect(parseXaiCreds('')).toBeUndefined();
    expect(parseXaiCreds('not-json')).toBeUndefined();
  });

  // The `{}` tombstone parses to an empty object (which isXaiSignedIn reads as signed-out); a real bundle
  // round-trips, tokenEndpoint (the discovered endpoint cache, D7) included.
  it('parses a tombstone to an empty object and a real bundle to its creds', () => {
    expect(parseXaiCreds('{}')).toEqual({});
    expect(parseXaiCreds('{"accessToken":"at","refreshToken":"rt","expiresAt":42,"tokenEndpoint":"https://auth.x.ai/token"}'))
      .toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 42, tokenEndpoint: 'https://auth.x.ai/token' });
  });
});

describe('xaiModelCaps', () => {
  // The OAuth path has no models.dev catalogKey, so without this the picker would show the neutral default
  // window. Windows are the model spec: grok-build 512K/30K, composer 200K/30K, grok-4.5 500K/131K reasoning.
  it('returns the per-model context/output windows', () => {
    expect(xaiModelCaps('grok-build')).toMatchObject({ contextInput: 512_000, maxOutput: 30_000 });
    expect(xaiModelCaps('grok-composer-2.5-fast')).toMatchObject({ contextInput: 200_000, maxOutput: 30_000 });
    expect(xaiModelCaps('grok-4.5')).toMatchObject({ contextInput: 500_000, maxOutput: 131_000 });
  });
});

describe('xaiModelsFrom', () => {
  const catalog = {
    xai: {
      models: {
        'grok-4.5': { release_date: '2026-07-01' },
        'grok-build': { release_date: '2026-06-01' },
        'grok-3': { release_date: '2025-02-01' },
        'grok-4-20250709': { release_date: '2025-07-09' }, // dated -YYYYMMDD snapshot → dropped
      },
    },
  };

  // Same rule as the anthropic/codex twins: drop dated snapshots, keep every undated id newest-first, no
  // family whitelist (a brand-new Grok id must surface, never be filtered out).
  it('drops dated snapshots, keeps every undated id newest-first', () => {
    expect(xaiModelsFrom(catalog)).toEqual(['grok-4.5', 'grok-build', 'grok-3']);
  });

  it('falls back to the curated list when the catalog is absent or empty', () => {
    expect(xaiModelsFrom(undefined)).toEqual(XAI_MODELS);
    expect(xaiModelsFrom({ xai: { models: {} } })).toEqual(XAI_MODELS);
  });

  // The curated fallback is the OAuth-only lineup; the row's defaultModel (grok-build) must be a member.
  it('lists the three OAuth models with grok-build present', () => {
    expect(XAI_MODELS).toEqual(['grok-build', 'grok-composer-2.5-fast', 'grok-4.5']);
  });
});

describe('effortOptionsFor — Grok', () => {
  // Grok is a Codex-twin on the Responses wire, which tops at xhigh (no 'max' level) — the picker must not
  // offer a level it can't send. (Per-model reasoning gating — build/composer none, 4.5 reasoning — lands
  // in the client slice #94; the ladder itself is provider-level.)
  it('offers the low→xhigh ladder for Grok, no max', () => {
    expect(effortOptionsFor(provider())).toEqual(['low', 'medium', 'high', 'xhigh']);
  });
});

describe('parseGrokAuthJson (#93 — ~/.grok/auth.json import)', () => {
  const CLIENT = 'b1a00492-073a-47ea-816f-4c329264a828';

  // Present shape: the Grok CLI nests creds under an "https://auth.x.ai::<client_id>" key — `key` is the
  // bearer, plus refresh_token + an absolute expires_at (already ms here).
  it('imports the namespaced xAI entry (key→bearer, refresh, expiry)', () => {
    const json = { [`https://auth.x.ai::${CLIENT}`]: { key: 'at', refresh_token: 'rt', expires_at: 1_750_000_000_000 } };
    expect(parseGrokAuthJson(json)).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1_750_000_000_000 });
  });

  // Some builds store expires_at in epoch SECONDS — normalize to ms by magnitude so the refresh check reads
  // a sane deadline (a wrong guess only forces one self-healing refresh, so this is best-effort).
  it('normalizes a seconds expires_at to milliseconds', () => {
    const json = { [`https://auth.x.ai::${CLIENT}`]: { key: 'at', refresh_token: 'rt', expires_at: 1_750_000_000 } };
    expect(parseGrokAuthJson(json)?.expiresAt).toBe(1_750_000_000_000);
  });

  // Legacy/flat shape: the creds sit at the root (no issuer-namespaced key).
  it('reads a flat legacy shape at the root', () => {
    expect(parseGrokAuthJson({ key: 'at', refresh_token: 'rt' })).toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });

  // Missing shapes: nothing usable (no bearer) → undefined, never a throw; the caller falls back to fresh sign-in.
  it('returns undefined for absent, empty, non-object, and bearer-less input', () => {
    expect(parseGrokAuthJson(undefined)).toBeUndefined();
    expect(parseGrokAuthJson({})).toBeUndefined();
    expect(parseGrokAuthJson('nope')).toBeUndefined();
    expect(parseGrokAuthJson({ [`https://auth.x.ai::${CLIENT}`]: { refresh_token: 'rt' } })).toBeUndefined();
  });
});

describe('isXaiEndpoint (#93 — OIDC discovery host allowlist)', () => {
  // A discovered OAuth endpoint MUST live on x.ai (or a subdomain) — otherwise the token/redirect would
  // leak the bearer off-domain. The leading-dot subdomain check blocks the look-alike bypasses.
  it('accepts x.ai and its subdomains', () => {
    expect(isXaiEndpoint('https://auth.x.ai/oauth2/token')).toBe(true);
    expect(isXaiEndpoint('https://x.ai/authorize')).toBe(true);
  });

  it('rejects off-domain, look-alike, and unparseable hosts', () => {
    expect(isXaiEndpoint('https://cli-chat-proxy.grok.com/v1')).toBe(false);
    expect(isXaiEndpoint('https://x.ai.evil.com/token')).toBe(false);
    expect(isXaiEndpoint('https://evilx.ai/token')).toBe(false);
    expect(isXaiEndpoint('not a url')).toBe(false);
    expect(isXaiEndpoint('')).toBe(false);
  });
});

describe('oauthModelOptions — Grok', () => {
  // The shared "which curated list backs an OAuth Provider" rule must recognize the xai kind and return the
  // Grok list (curated fallback without a catalog).
  it('returns the Grok list for the xai-oauth kind', () => {
    expect(oauthModelOptions(provider(), undefined)).toEqual(XAI_MODELS);
  });

  it('reads the models.dev catalog when present', () => {
    const catalog = { xai: { models: { 'grok-4.5': { release_date: '2026-07-01' } } } };
    expect(oauthModelOptions(provider(), catalog)).toEqual(['grok-4.5']);
  });
});
