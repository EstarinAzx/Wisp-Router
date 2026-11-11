import { afterEach, describe, expect, test, vi } from 'vitest';
import { CodexAuth } from '../src/codexAuth';
import { AnthropicAuth } from '../src/anthropicAuth';
import { AntigravityAuth } from '../src/antigravityAuth';
import { XaiAuth } from '../src/xaiAuth';
import { KimiAuth } from '../src/kimiAuth';
import { AuthStateChangedError } from '../src/homeStore';
import type { CodexCreds, AnthropicCreds, AntigravityCreds, XaiCreds, KimiCreds } from '../src/catalog';

type Creds = CodexCreds & AnthropicCreds & AntigravityCreds & XaiCreds & KimiCreds;
const providers = ['codex', 'anthropic', 'antigravity', 'xai', 'kimi'] as const;
type Provider = typeof providers[number];
const jwt = (exp: number) => `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.fixture`;
const initial = (): Creds => ({ accessToken: jwt(1), refreshToken: 'old-refresh', expiresAt: 1,
  projectId: 'project', tokenEndpoint: 'https://auth.x.ai/token' });
const renewed = () => ({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600), refresh_token: 'new-refresh', expires_in: 3600 });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
const memStore = (value: Creds | undefined = initial()) => ({
  read: () => value,
  write: (next: Creds, expected?: string | Creds) => {
    if (expected !== undefined && JSON.stringify(value) !== (typeof expected === 'string' ? expected : JSON.stringify(expected))) {
      throw new AuthStateChangedError();
    }
    value = next;
  },
});
const manager = (provider: Provider, store: ReturnType<typeof memStore>) => {
  switch (provider) {
    case 'codex': return new CodexAuth(store, async () => false, () => {});
    case 'anthropic': return new AnthropicAuth(store, async () => false, () => {});
    case 'antigravity': return new AntigravityAuth(store, async () => false, () => {});
    case 'xai': return new XaiAuth(store, async () => false, () => {});
    case 'kimi': return new KimiAuth(store, () => {});
  }
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(providers)('%s refresh lifecycle', provider => {
  test('shares one rotating grant between concurrent callers', async () => {
    const response = deferred<Response>();
    let grants = 0;
    vi.stubGlobal('fetch', () => { grants++; return response.promise; });
    const store = memStore(), auth = manager(provider, store);
    const pending = Promise.allSettled([auth.current(), auth.current()]);
    const payload = renewed();
    response.resolve(Response.json(payload));
    const results = await pending;
    expect(grants).toBe(1);
    expect(results).toEqual([
      { status: 'fulfilled', value: expect.objectContaining({ accessToken: payload.access_token, refreshToken: 'new-refresh' }) },
      { status: 'fulfilled', value: expect.objectContaining({ accessToken: payload.access_token, refreshToken: 'new-refresh' }) },
    ]);
    expect(store.read()?.accessToken).toBe(payload.access_token);
  });

  test('shares a failed grant and permits the next call to retry', async () => {
    const response = deferred<Response>();
    let grants = 0;
    vi.stubGlobal('fetch', () => { grants++; return response.promise; });
    const store = memStore(), before = store.read(), auth = manager(provider, store);
    const pending = Promise.all([auth.current(), auth.current()]);
    response.resolve(new Response('refused', { status: 401 }));
    expect(await pending).toEqual([before, before]);
    expect(grants).toBe(1);
    vi.stubGlobal('fetch', async () => { grants++; return Response.json(renewed()); });
    expect((await auth.current())?.refreshToken).toBe('new-refresh');
    expect(grants).toBe(2);
  });

  test.each(['success', 'refused', 'offline', 'malformed'] as const)('rejects a superseded account after a %s grant', async outcome => {
    for (const change of ['signout', 'replacement'] as const) {
      const response = deferred<void>();
      vi.stubGlobal('fetch', async () => {
        await response.promise;
        if (outcome === 'offline') throw new Error('synthetic offline');
        return outcome === 'refused' ? new Response('refused', { status: 401 }) : Response.json(outcome === 'malformed' ? {} : renewed());
      });
      const store = memStore(), auth = manager(provider, store);
      const pending = Promise.allSettled([auth.current(), auth.current()]);
      if (change === 'signout') auth.signOut();
      else store.write({ accessToken: 'different-account', refreshToken: 'different-refresh', expiresAt: Date.now() + 3600000, projectId: 'different-project' });
      const preserved = store.read();
      response.resolve();
      const results = await pending;
      expect(store.read()).toEqual(preserved);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(AuthStateChangedError);
      }
    }
  });
});

describe.each(['anthropic', 'xai'] as const)('%s malformed refresh', provider => {
  test.each([
    ['empty object', {}],
    ['blank access token', { access_token: ' ', expires_in: 3600 }],
    ['wrong access token type', { access_token: 7, expires_in: 3600 }],
    ['missing expiry', { access_token: 'new' }],
    ['wrong expiry type', { access_token: 'new', expires_in: '3600' }],
    ['expired replacement', { access_token: 'new', expires_in: -1 }],
    ['blank refresh token', { access_token: 'new', expires_in: 3600, refresh_token: ' ' }],
    ['wrong refresh token type', { access_token: 'new', expires_in: 3600, refresh_token: 7 }],
  ])('retains usable credentials and retries after %s', async (_label, payload) => {
    const store = memStore(), before = store.read(), auth = manager(provider, store);
    vi.stubGlobal('fetch', async () => Response.json(payload));
    expect(await auth.current()).toEqual(before);
    expect(store.read()).toEqual(before);
    vi.stubGlobal('fetch', async () => Response.json(renewed()));
    expect((await auth.current())?.refreshToken).toBe('new-refresh');
  });
});

test('shares Antigravity project hydration after a rotating grant', async () => {
  const response = deferred<Response>();
  let grants = 0, projects = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('loadCodeAssist')) { projects++; return Response.json({ cloudaicompanionProject: 'project' }); }
    grants++;
    return response.promise;
  });
  const store = memStore({ accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 1 });
  const auth = manager('antigravity', store);
  const pending = Promise.allSettled([auth.current(), auth.current()]);
  response.resolve(Response.json(renewed()));
  const results = await pending;
  expect(grants).toBe(1);
  expect(projects).toBe(1);
  expect(results).toEqual([
    { status: 'fulfilled', value: expect.objectContaining({ projectId: 'project', refreshToken: 'new-refresh' }) },
    { status: 'fulfilled', value: expect.objectContaining({ projectId: 'project', refreshToken: 'new-refresh' }) },
  ]);
});

test('Antigravity does not reuse a settled current result for another account', async () => {
  const store = memStore({ accessToken: 'old-account', projectId: 'old-project' });
  const auth = manager('antigravity', store);
  const old = auth.current();
  store.write({ accessToken: 'new-account', projectId: 'new-project' });
  const current = auth.current();
  await old.catch(() => {});
  expect(await current).toMatchObject({ accessToken: 'new-account', projectId: 'new-project' });
});

test.each([false, true])('Antigravity shares pending project hydration with a later caller (renewal: %s)', async renewal => {
  const projectStarted = deferred<void>(), projectResponse = deferred<Response>();
  let projects = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    if (!url.includes('loadCodeAssist')) return Response.json(renewed());
    projects++;
    projectStarted.resolve();
    return projectResponse.promise;
  });
  const store = memStore({ accessToken: 'old', ...(renewal ? { refreshToken: 'old-refresh', expiresAt: 1 } : {}) });
  const auth = manager('antigravity', store);
  const first = auth.current();
  await projectStarted.promise;
  const pending = Promise.allSettled([first, auth.current()]);
  projectResponse.resolve(Response.json({ cloudaicompanionProject: 'project' }));
  const results = await pending;
  expect(projects).toBe(1);
  expect(results).toEqual([
    { status: 'fulfilled', value: expect.objectContaining({ projectId: 'project' }) },
    { status: 'fulfilled', value: expect.objectContaining({ projectId: 'project' }) },
  ]);
});

test.each(['signout', 'replacement', 'unchanged'] as const)('Antigravity checks the account after a failed project save (%s)', async change => {
  const store = memStore({ accessToken: 'old-account' });
  const save = store.write;
  store.write = () => {
    if (change !== 'unchanged') save(change === 'signout' ? {} : { accessToken: 'new-account' });
    throw new Error('synthetic busy store');
  };
  vi.stubGlobal('fetch', async () => Response.json({ cloudaicompanionProject: 'project' }));
  const result = manager('antigravity', store).current();
  if (change === 'unchanged') await expect(result).resolves.toMatchObject({ accessToken: 'old-account', projectId: 'project' });
  else await expect(result).rejects.toBeInstanceOf(AuthStateChangedError);
  expect(store.read()).toEqual(change === 'signout' ? {} : { accessToken: change === 'replacement' ? 'new-account' : 'old-account' });
});

test('Antigravity rejects an account changed during failed project hydration', async () => {
  const response = deferred<Response>();
  vi.stubGlobal('fetch', () => response.promise);
  const store = memStore({ accessToken: 'old-account' });
  const auth = manager('antigravity', store);
  const pending = auth.current().catch(error => error);
  auth.signOut();
  response.resolve(new Response('offline', { status: 503 }));
  expect(await pending).toBeInstanceOf(AuthStateChangedError);
  expect(store.read()).toEqual({});
});

describe.each(['codex', 'anthropic', 'antigravity', 'xai'] as const)('%s browser callback cleanup', provider => {
  test.each([false, true])('releases its timeout after callback (rejected: %s)', async rejected => {
    const realFetch = globalThis.fetch, realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback, ms, ...args) => {
      const timer = realSetTimeout(callback, ms, ...args);
      if (ms === 300000) { pendingTimers.add(timer); timer.unref(); }
      return timer;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(timer => {
      pendingTimers.delete(timer as ReturnType<typeof setTimeout>);
      realClearTimeout(timer);
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) return realFetch(input, init);
      if (url === 'https://auth.x.ai/.well-known/openid-configuration') return Response.json({ authorization_endpoint: 'https://auth.x.ai/authorize', token_endpoint: 'https://auth.x.ai/token' });
      if (['https://auth.openai.com/oauth/token', 'https://platform.claude.com/v1/oauth/token', 'https://oauth2.googleapis.com/token', 'https://auth.x.ai/token'].includes(url)) return Response.json(renewed());
      if (url === 'https://api.anthropic.com/api/claude_cli/bootstrap') return Response.json({});
      if (url === 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist') return Response.json({ cloudaicompanionProject: 'project' });
      throw new Error(`Unexpected network request: ${url}`);
    });
    const opened = deferred<string>();
    const open = async (url: string) => { opened.resolve(url); return true; };
    const store = memStore({});
    const constructors = { codex: CodexAuth, anthropic: AnthropicAuth, antigravity: AntigravityAuth, xai: XaiAuth };
    const auth = new constructors[provider](store, open, () => {});
    const result = auth.signIn().then(value => ({ value }), error => ({ error }));
    try {
      const authorize = new URL(await opened.promise);
      const redirect = new URL(authorize.searchParams.get('redirect_uri')!);
      redirect.searchParams.set('code', 'fixture-code');
      redirect.searchParams.set('state', rejected ? 'invalid-state' : authorize.searchParams.get('state')!);
      await fetch(redirect);
      const settled = await result;
      if (rejected) expect('error' in settled && String(settled.error)).toMatch(/state mismatch/i);
      else expect('value' in settled && settled.value.accessToken).toBeTruthy();
      expect(pendingTimers.size).toBe(0);
    } finally {
      for (const timer of pendingTimers) realClearTimeout(timer);
    }
  });
});
