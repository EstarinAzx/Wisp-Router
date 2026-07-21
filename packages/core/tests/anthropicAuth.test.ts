// ---------------- anthropicAuth.test.ts — bootstrap fetch + token-lifecycle identity (#150) ---------------- //

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnthropicAuth, fetchAnthropicBootstrap } from '../src/anthropicAuth';
import type { AnthropicCreds } from '../src/catalog';

const memStore = (initial?: AnthropicCreds) => {
  let creds = initial;
  return {
    read: () => creds,
    write: (c: AnthropicCreds) => { creds = c; },
  };
};

describe('fetchAnthropicBootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());

  const PAYLOAD = {
    oauth_account: {
      account_uuid: 'u-1', account_email: 'you@x.com',
      organization_name: 'Org', organization_rate_limit_tier: 'default_claude_max_20x',
    },
  };

  // The claude_cli bootstrap endpoint: OAuth bearer + the oauth beta header, GET, JSON back.
  it('fetches the bootstrap endpoint with the bearer + oauth beta and maps the account', async () => {
    let sentUrl = ''; let sentInit: any;
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      sentUrl = String(url); sentInit = init;
      return new Response(JSON.stringify(PAYLOAD), { status: 200 });
    });
    expect(await fetchAnthropicBootstrap('tok')).toEqual({
      accountUuid: 'u-1', accountEmail: 'you@x.com', organizationName: 'Org', rateLimitTier: 'default_claude_max_20x',
    });
    expect(sentUrl).toBe('https://api.anthropic.com/api/claude_cli/bootstrap');
    expect(sentInit.headers['Authorization']).toBe('Bearer tok');
    expect(sentInit.headers['anthropic-beta']).toBe('oauth-2025-04-20');
  });

  // Best-effort contract (#150): a dead endpoint, a bad status, or junk JSON must never throw — the
  // access token is valid regardless, so sign-in proceeds without an account.
  it('resolves undefined on a non-2xx, junk JSON, and a network error', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    expect(await fetchAnthropicBootstrap('tok')).toBeUndefined();
    vi.stubGlobal('fetch', async () => new Response('not-json', { status: 200 }));
    expect(await fetchAnthropicBootstrap('tok')).toBeUndefined();
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect(await fetchAnthropicBootstrap('tok')).toBeUndefined();
  });
});

describe('AnthropicAuth — identity through the token lifecycle (#150)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const identity = {
    deviceId: 'ab'.repeat(32), accountUuid: 'u-1', accountEmail: 'you@x.com',
    organizationName: 'Org', rateLimitTier: 'default_claude_max_20x',
  };

  // A refresh rebuilds the creds from the token payload — the identity fields must ride along, or one
  // hour after sign-in the account display and metadata.user_id silently lose their data.
  it('carries the identity fields across a token refresh', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() + 1000, ...identity });
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ access_token: 'new', refresh_token: 'rt2', expires_in: 3600 }), { status: 200 }));
    const auth = new AnthropicAuth(store, async () => true, () => {});
    const creds = await auth.current();
    expect(creds).toMatchObject({ accessToken: 'new', refreshToken: 'rt2', ...identity });
    expect(store.read()).toMatchObject(identity);
  });

  // The device id is minted ONCE per install — sign-out keeps it so a later sign-in reuses it, while
  // the token fields still tombstone to signed-out.
  it('preserves the device id across sign-out', () => {
    const store = memStore({ accessToken: 'at', ...identity });
    const auth = new AnthropicAuth(store, async () => true, () => {});
    auth.signOut();
    expect(store.read()).toEqual({ deviceId: identity.deviceId });
  });
});
