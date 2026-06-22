// ---------------- anthropic.test.ts — pure Anthropic OAuth Provider helpers ---------------- //

import { describe, it, expect } from 'vitest';
import {
  isAnthropicProvider, isAnthropicSignedIn,
  tokensToAnthropicCreds, shouldRefreshAnthropicToken, parseAnthropicCreds,
  base64url, codeVerifier, codeChallenge, oauthState,
  anthropicFingerprint, anthropicAttribution,
  type Provider,
} from './catalog';

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'anthropic', label: 'Claude', baseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-opus-4-8', apiKeyEnv: '', ...over,
});

describe('isAnthropicProvider', () => {
  it('is true for a row whose kind is anthropic-oauth', () => {
    expect(isAnthropicProvider(provider({ kind: 'anthropic-oauth' }))).toBe(true);
  });

  // Absent kind defaults to openai-chat; the Codex row stays distinct — both must read non-anthropic.
  it('is false for absent kind, openai-chat, and codex', () => {
    expect(isAnthropicProvider(provider({ kind: undefined }))).toBe(false);
    expect(isAnthropicProvider(provider({ kind: 'openai-chat' }))).toBe(false);
    expect(isAnthropicProvider(provider({ kind: 'codex' }))).toBe(false);
  });
});

describe('isAnthropicSignedIn', () => {
  // Anthropic has no API key — usable == a bearer access token is present.
  it('is true when an access token is present', () => {
    expect(isAnthropicSignedIn({ accessToken: 'at', refreshToken: 'rt' })).toBe(true);
  });

  // A `{}` tombstone (written on sign-out) and a refresh-only blob both read as signed-out.
  it('is false for undefined, the tombstone, and a bearer-less blob', () => {
    expect(isAnthropicSignedIn(undefined)).toBe(false);
    expect(isAnthropicSignedIn({})).toBe(false);
    expect(isAnthropicSignedIn({ refreshToken: 'rt' })).toBe(false);
  });
});

describe('tokensToAnthropicCreds', () => {
  // expires_in (seconds, relative) becomes an absolute expiresAt (epoch ms) against the injected clock —
  // Anthropic tokens carry no JWT exp, so the deadline must be computed at exchange time and stored.
  it('computes expiresAt from expires_in against the supplied clock', () => {
    expect(tokensToAnthropicCreds({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }, 1000))
      .toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1000 + 3_600_000 });
  });

  // No expires_in → no expiresAt key (time-based refresh simply never fires; a live 401 still recovers).
  it('omits expiresAt when expires_in is absent', () => {
    expect(tokensToAnthropicCreds({ access_token: 'at', refresh_token: 'rt' }, 1000))
      .toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });
});

describe('shouldRefreshAnthropicToken', () => {
  const now = 1_000_000_000_000; // fixed clock so the 5-minute skew window is deterministic

  // Refresh once the token is within 5 minutes of expiry, so it can't die mid-request.
  it('is true when expiry is inside the 5-minute skew window', () => {
    expect(shouldRefreshAnthropicToken({ expiresAt: now + 200_000 }, now)).toBe(true);
  });

  // The boundary is inclusive — exactly 5 minutes out still refreshes.
  it('is true exactly at the 5-minute boundary', () => {
    expect(shouldRefreshAnthropicToken({ expiresAt: now + 5 * 60_000 }, now)).toBe(true);
  });

  it('is false when expiry is well past the skew window', () => {
    expect(shouldRefreshAnthropicToken({ expiresAt: now + 3_600_000 }, now)).toBe(false);
  });

  // No deadline → can't prove staleness, so don't force a refresh that might block a working token.
  it('is false when there is no expiresAt', () => {
    expect(shouldRefreshAnthropicToken({}, now)).toBe(false);
  });
});

describe('parseAnthropicCreds', () => {
  // A corrupt slot reads as "no creds" rather than throwing — the read path must never crash sign-in state.
  it('returns undefined for absent, empty, and non-JSON slots', () => {
    expect(parseAnthropicCreds(undefined)).toBeUndefined();
    expect(parseAnthropicCreds('')).toBeUndefined();
    expect(parseAnthropicCreds('not-json')).toBeUndefined();
  });

  // The `{}` tombstone parses to an empty object (which isAnthropicSignedIn reads as signed-out).
  it('parses a tombstone to an empty object and a real bundle to its creds', () => {
    expect(parseAnthropicCreds('{}')).toEqual({});
    expect(parseAnthropicCreds('{"accessToken":"at","refreshToken":"rt"}'))
      .toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });
});

describe('base64url', () => {
  // No '+'/'/' and no '=' padding — the form PKCE and the authorize URL require.
  it('encodes URL-safe with padding stripped', () => {
    expect(base64url(Buffer.from([0xff, 0xff, 0xff]))).toBe('____');
    expect(base64url(Buffer.from([0xff]))).toBe('_w');
  });
});

describe('codeChallenge', () => {
  // RFC 7636 Appendix B test vector: the S256 challenge of this verifier is deterministic.
  it('derives the S256 base64url challenge (RFC 7636 vector)', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('codeVerifier / oauthState', () => {
  // Both are 32 random bytes as base64url → 43 url-safe chars, no padding.
  it('produce 43-char URL-safe strings', () => {
    expect(codeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oauthState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('anthropicFingerprint', () => {
  // The Claude Code client fingerprint the backend recomputes + validates: 3 hex chars of
  // sha256(salt + msg[4] + msg[7] + msg[20] + version). Vectors computed independently from the spec.
  it('samples chars 4/7/20 and hashes with the salt + version', () => {
    expect(anthropicFingerprint('hello world', '0.19.0')).toBe('ad2');
  });

  // Missing indices substitute '0' — an empty message samples '000'.
  it('substitutes 0 for out-of-range indices', () => {
    expect(anthropicFingerprint('', '0.19.0')).toBe('784');
  });
});

describe('anthropicAttribution', () => {
  // The first system block openclaude sends — carries the validated fingerprint. No cch (native
  // attestation unreproducible/unenforced), no cc_workload for an interactive run.
  it('builds the x-anthropic-billing-header attribution string', () => {
    expect(anthropicAttribution('hello world', '0.19.0'))
      .toBe('x-anthropic-billing-header: cc_version=0.19.0.ad2; cc_entrypoint=cli;');
  });
});
