// ---------------- antigravityAuth.test.ts — sign-in round trip, refresh contract, project bootstrap (#188) ---------------- //

/*
 * Constants asserted here are the ones #186 measured on the live wire, not read off the reference: client
 * id, the :51121/oauth-callback redirect, the five scopes, the pinned 2.2.1 User-Agent, and the PROD host
 * for loadCodeAssist (the daily host serves the turns; the bootstrap is pinned to prod, as the reference's
 * own test pins it too).
 *
 * The sign-in test drives the REAL loopback catcher: openExternal hands us the authorize URL, we pull the
 * redirect_uri + state out of it and fire the callback ourselves. That covers the whole round trip without
 * a browser — and it is the only way the PKCE parameters get asserted as actually sent.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AntigravityAuth, fetchAntigravityProject } from '../src/antigravityAuth';
import type { AntigravityCreds } from '../src/catalog';

const memStore = (initial?: AntigravityCreds) => {
  let creds = initial;
  return { read: () => creds, write: (c: AntigravityCreds) => { creds = c; } };
};

const LOAD_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';

// ----------------------------- fetchAntigravityProject ----------------------------- //

describe('fetchAntigravityProject', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs loadCodeAssist on the PRODUCTION host with the bearer, the pinned UA, and the ideType body', async () => {
    let sentUrl = ''; let sentInit: any;
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      sentUrl = String(url); sentInit = init;
      return new Response(JSON.stringify({ cloudaicompanionProject: 'example-project-1' }), { status: 200 });
    });
    expect(await fetchAntigravityProject('ya29.tok')).toBe('example-project-1');
    expect(sentUrl).toBe(LOAD_URL);
    expect(sentInit.method).toBe('POST');
    expect(sentInit.headers['Authorization']).toBe('Bearer ya29.tok');
    expect(sentInit.headers['User-Agent']).toBe('antigravity/hub/2.17.0 (aidev_client; os_type=darwin; arch=arm64; cl=986210228)');
    expect(JSON.parse(sentInit.body)).toEqual({ metadata: { ideType: 'ANTIGRAVITY' } });
  });

  // Best-effort by contract, exactly like the Anthropic bootstrap: the access token is valid whether or not
  // this answers, so sign-in must never fail on it. An absent project is #189's hard 400 at request-build
  // time, not a sign-in error.
  it('resolves undefined on a non-2xx, junk JSON, a missing project, and a network error', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    expect(await fetchAntigravityProject('t')).toBeUndefined();
    vi.stubGlobal('fetch', async () => new Response('not-json', { status: 200 }));
    expect(await fetchAntigravityProject('t')).toBeUndefined();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ currentTier: { id: 'free-tier' } }), { status: 200 }));
    expect(await fetchAntigravityProject('t')).toBeUndefined();
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect(await fetchAntigravityProject('t')).toBeUndefined();
  });
});

// ----------------------------- Sign-in: the loopback round trip ----------------------------- //

describe('AntigravityAuth.signIn', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Drive the real catcher: capture the authorize URL, then GET its own redirect_uri with the code + state.
  const completeFlow = async (auth: AntigravityAuth, seen: { url?: string }, opts: { state?: string } = {}) => {
    const signIn = auth.signIn();
    // Attach a handler NOW. The flow can reject (the CSRF case) while this helper is still polling, and a
    // rejection with no handler yet is an unhandled rejection that fails the run even though the assertion
    // below passes. A real caller attaches synchronously, so this is a test-harness concern only.
    signIn.catch(() => {});
    // openExternal resolves before the browser would ever answer; poll until the URL lands.
    for (let i = 0; i < 200 && !seen.url; i++) await new Promise((r) => setTimeout(r, 5));
    const authorize = new URL(seen.url!);
    const redirect = new URL(authorize.searchParams.get('redirect_uri')!);
    redirect.searchParams.set('code', 'auth-code-1');
    redirect.searchParams.set('state', opts.state ?? authorize.searchParams.get('state')!);
    await fetch(redirect.toString()).catch(() => {});
    return { authorize, result: signIn };
  };

  const stubEndpoints = (over: { token?: () => Response; load?: () => Response } = {}) => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      const href = String(url);
      if (href === 'https://oauth2.googleapis.com/token') {
        return (over.token ?? (() => new Response(
          JSON.stringify({ access_token: 'ya29.new', refresh_token: '1//rt', expires_in: 3599 }), { status: 200 })))();
      }
      if (href === LOAD_URL) {
        return (over.load ?? (() => new Response(
          JSON.stringify({ cloudaicompanionProject: 'example-project-1' }), { status: 200 })))();
      }
      return realFetch(url, init); // the loopback callback the test itself fires
    });
  };

  it('opens a Google authorize URL carrying PKCE S256, offline access, and the five measured scopes', async () => {
    stubEndpoints();
    const seen: { url?: string } = {};
    const auth = new AntigravityAuth(memStore(), async (u) => { seen.url = u; return true; }, () => {});
    const { authorize, result } = await completeFlow(auth, seen);
    await result;

    expect(authorize.origin + authorize.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authorize.searchParams.get('client_id'))
      .toBe('1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com');
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://localhost:51121/oauth-callback');
    expect(authorize.searchParams.get('response_type')).toBe('code');
    // The refresh token only comes back with BOTH of these (#186) — drop either and the bundle is
    // access-token-only, so the Provider dies silently an hour after sign-in.
    expect(authorize.searchParams.get('access_type')).toBe('offline');
    expect(authorize.searchParams.get('prompt')).toBe('consent');
    // PKCE is Wisp's addition over the reference (which ships a bare code flow); #186 proved it accepted.
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(authorize.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
    expect(authorize.searchParams.get('scope')?.split(' ')).toEqual([
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/cclog',
      'https://www.googleapis.com/auth/experimentsandconfigs',
    ]);
  });

  it('completes the round trip and persists tokens plus the bootstrapped project id', async () => {
    stubEndpoints();
    const store = memStore();
    const seen: { url?: string } = {};
    const auth = new AntigravityAuth(store, async (u) => { seen.url = u; return true; }, () => {});
    const { result } = await completeFlow(auth, seen);
    const creds = await result;

    expect(creds).toMatchObject({ accessToken: 'ya29.new', refreshToken: '1//rt', projectId: 'example-project-1' });
    expect(creds.expiresAt).toBeGreaterThan(Date.now());
    expect(store.read()).toEqual(creds);
  });

  // A failed bootstrap must NOT discard a perfectly good token pair — the project is re-fetched on the next
  // current(). Losing the refresh token here would cost the user a whole browser round trip.
  it('still signs in when the project bootstrap fails', async () => {
    stubEndpoints({ load: () => new Response('boom', { status: 500 }) });
    const store = memStore();
    const seen: { url?: string } = {};
    const auth = new AntigravityAuth(store, async (u) => { seen.url = u; return true; }, () => {});
    const { result } = await completeFlow(auth, seen);
    const creds = await result;

    expect(creds.accessToken).toBe('ya29.new');
    expect(creds.projectId).toBeUndefined();
    expect(store.read()?.refreshToken).toBe('1//rt');
  });

  it('rejects a callback whose state does not match — the CSRF guard', async () => {
    stubEndpoints();
    const store = memStore();
    const seen: { url?: string } = {};
    const auth = new AntigravityAuth(store, async (u) => { seen.url = u; return true; }, () => {});
    const { result } = await completeFlow(auth, seen, { state: 'forged' });
    await expect(result).rejects.toThrow(/state mismatch/i);
    expect(store.read()).toBeUndefined();
  });
});

// ----------------------------- Refresh: the #59 contract ----------------------------- //

describe('AntigravityAuth — token lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  const near = () => Date.now() + 60_000; // inside the 5-minute skew window

  it('refreshes a near-expiry token, persists it, and keeps the project id', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: '1//rt', expiresAt: near(), projectId: 'p-1' });
    let sentBody = '';
    vi.stubGlobal('fetch', async (_u: string, init: any) => {
      sentBody = String(init.body);
      return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3599 }), { status: 200 });
    });
    const auth = new AntigravityAuth(store, async () => true, () => {});
    const creds = await auth.current();

    expect(creds).toMatchObject({ accessToken: 'fresh', projectId: 'p-1' });
    // Google's refresh response omits refresh_token — keep the old one or the NEXT refresh has nothing to send.
    expect(creds?.refreshToken).toBe('1//rt');
    expect(store.read()?.accessToken).toBe('fresh');
    // Google's token endpoint is form-encoded and this client is a desktop client: the secret rides along.
    expect(sentBody).toContain('grant_type=refresh_token');
    expect(sentBody).toContain('client_secret=');
  });

  it('does not refresh a token that is comfortably in date', async () => {
    const store = memStore({ accessToken: 'good', refreshToken: '1//rt', expiresAt: Date.now() + 30 * 60_000, projectId: 'p-1' });
    vi.stubGlobal('fetch', async () => { throw new Error('should not be called'); });
    const auth = new AntigravityAuth(store, async () => true, () => {});
    expect((await auth.current())?.accessToken).toBe('good');
  });

  // Two processes share auth.json (extension + TUI). If the other one already rotated, our refresh token is
  // spent — re-read and use its bundle rather than firing a dead token.
  it('re-reads the store before refreshing and yields to a rotation another process already did', async () => {
    // First read hands back the stale bundle (so a refresh looks due); by the second read the other process
    // has landed its rotation. Firing our spent refresh token at Google would 400 and cost the session.
    const rotated: AntigravityCreds = { accessToken: 'other-process', refreshToken: '1//rt2', expiresAt: Date.now() + 30 * 60_000, projectId: 'p-1' };
    let reads = 0;
    const store = {
      read: () => (++reads === 1 ? { accessToken: 'old', refreshToken: '1//rt', expiresAt: near(), projectId: 'p-1' } : rotated),
      write: () => {},
    };
    vi.stubGlobal('fetch', async () => { throw new Error('should not be called'); });
    const auth = new AntigravityAuth(store, async () => true, () => {});
    expect((await auth.current())?.accessToken).toBe('other-process');
  });

  it('is non-fatal on a failed refresh — the existing credentials are returned, not discarded', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: '1//rt', expiresAt: near(), projectId: 'p-1' });
    vi.stubGlobal('fetch', async () => new Response('bad grant', { status: 400 }));
    const auth = new AntigravityAuth(store, async () => true, () => {});
    expect(await auth.current()).toMatchObject({ accessToken: 'old', refreshToken: '1//rt' });

    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect(await auth.current()).toMatchObject({ accessToken: 'old' });
  });

  it.each([
    ['missing token', {}],
    ['missing expiry', { access_token: 'fresh' }],
    ['non-string token', { access_token: 7, expires_in: 3599 }],
    ['blank token', { access_token: '   ', expires_in: 3599 }],
    ['string expiry', { access_token: 'fresh', expires_in: '3599' }],
    ['zero expiry', { access_token: 'fresh', expires_in: 0 }],
    ['negative expiry', { access_token: 'fresh', expires_in: -1 }],
    ['overflowing expiry', { access_token: 'fresh', expires_in: 1e308 }],
    ['invalid refresh token', { access_token: 'fresh', expires_in: 3599, refresh_token: 7 }],
    ['blank refresh token', { access_token: 'fresh', expires_in: 3599, refresh_token: '   ' }],
  ])('preserves the existing bundle on an HTTP 200 refresh with %s', async (_label, payload) => {
    const original = { accessToken: 'old', refreshToken: '1//rt', expiresAt: near(), projectId: 'p-1' };
    const store = memStore(original);
    const write = vi.spyOn(store, 'write');
    const fetch = vi.fn(async () => Response.json(payload));
    vi.stubGlobal('fetch', fetch);

    expect(await new AntigravityAuth(store, async () => true, () => {}).current()).toEqual(original);
    expect(store.read()).toEqual(original);
    expect(write).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // The rotation already happened SERVER-side, so the old refresh token is spent. Dropping the new bundle
  // because auth.json could not be written strands the session on a token that no longer refreshes.
  it('keeps a rotation the server already performed when the store write throws', async () => {
    let creds: AntigravityCreds | undefined = { accessToken: 'old', refreshToken: '1//rt', expiresAt: near(), projectId: 'p-1' };
    const store = { read: () => creds, write: () => { throw new Error('EACCES'); } };
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ access_token: 'fresh', refresh_token: '1//rt2', expires_in: 3599 }), { status: 200 }));
    const logged: string[] = [];
    const auth = new AntigravityAuth(store, async () => true, (m) => logged.push(m));

    expect(await auth.current()).toMatchObject({ accessToken: 'fresh', refreshToken: '1//rt2' });
    expect(logged.join(' ')).toMatch(/persist/i);
  });

  // "Re-fetch if absent" (#188): a bundle that signed in while loadCodeAssist was down must heal itself
  // rather than 400 forever at request-build time.
  it('bootstraps an absent project id on current() and persists it', async () => {
    const store = memStore({ accessToken: 'ya29.a', refreshToken: '1//rt', expiresAt: Date.now() + 30 * 60_000 });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ cloudaicompanionProject: 'p-9' }), { status: 200 }));
    const auth = new AntigravityAuth(store, async () => true, () => {});

    expect((await auth.current())?.projectId).toBe('p-9');
    expect(store.read()?.projectId).toBe('p-9');
  });

  it('does not bootstrap when signed out, and does not re-fetch a project it already has', async () => {
    const signedOut = memStore({});
    vi.stubGlobal('fetch', async () => { throw new Error('should not be called'); });
    expect(await new AntigravityAuth(signedOut, async () => true, () => {}).current()).toEqual({});

    const complete = memStore({ accessToken: 'a', expiresAt: Date.now() + 30 * 60_000, projectId: 'p-1' });
    expect((await new AntigravityAuth(complete, async () => true, () => {}).current())?.projectId).toBe('p-1');
  });

  // Sign-out writes a TOMBSTONE, not a delete: a present-but-bearer-less blob reads as signed out and
  // survives a restart. The project id goes with it — it belongs to the account that just left.
  it('signs out to a tombstone that survives a restart', () => {
    const store = memStore({ accessToken: 'a', refreshToken: '1//rt', expiresAt: Date.now(), projectId: 'p-1' });
    new AntigravityAuth(store, async () => true, () => {}).signOut();
    expect(store.read()).toEqual({});
  });

  it('answers isSignedIn from the store alone — no refresh round trip', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('should not be called'); });
    const stale = { accessToken: 'a', refreshToken: '1//rt', expiresAt: 1 };
    expect(await new AntigravityAuth(memStore(stale), async () => true, () => {}).isSignedIn()).toBe(true);
    expect(await new AntigravityAuth(memStore({}), async () => true, () => {}).isSignedIn()).toBe(false);
    expect(await new AntigravityAuth(memStore(), async () => true, () => {}).isSignedIn()).toBe(false);
  });
});
