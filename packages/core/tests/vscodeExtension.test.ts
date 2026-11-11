import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('vscode', () => import('./fixtures/vscode'));
vi.mock('http', async importOriginal => {
  const actual = await importOriginal<typeof import('http')>();
  const { EventEmitter } = await import('events');
  // Exercise real auth/host state without competing with the auth suite's real fixed-port catcher.
  return { ...actual, createServer: () => {
    const server = new EventEmitter();
    return Object.assign(server, { listen: () => queueMicrotask(() => server.emit('listening')), close: () => {} });
  } };
});
import { testing, env } from './fixtures/vscode';
import { WispHome } from '../src/index';
import { activate } from '../../vscode/src/extension';

let dir: string, home: WispHome;
let subscriptions: { dispose: () => any }[];
const requests: { url: string; init: any }[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wisp-vscode-')); vi.stubEnv('WISP_HOME', dir);
  home = new WispHome(); home.writeConfig({ provider: 'antigravity', models: { antigravity: 'gemini-3-flash' } });
  home.writeAuth({ keys: { custom: 'preserved' }, antigravity: { accessToken: 'expired', refreshToken: 'synthetic-refresh', expiresAt: 1, projectId: 'synthetic-project' } });
  testing.commands.clear(); testing.logs.length = 0; testing.notices.length = 0; requests.length = 0;
  vi.stubGlobal('fetch', async (url: any, init: any) => {
    requests.push({ url: String(url), init });
    if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'refreshed', expires_in: 3600 });
    if (String(url).endsWith(':fetchAvailableModels')) return Response.json({ models: { 'gemini-3-flash': {}, 'gemini-3.1-pro-low': {} } });
    return Response.json({});
  });
  subscriptions = [];
  activate({ subscriptions, extensionUri: {} as any, secrets: { get: async () => undefined, delete: async () => {} },
    globalState: { get: () => undefined, update: async () => {} }, environmentVariableCollection: { clear() {} } } as any);
});
afterEach(async () => {
  for (const sub of subscriptions) await sub.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); rmSync(dir, { recursive: true, force: true });
});
describe('extension Antigravity wiring', () => {
  it('publishes fallback state within four seconds even while credential preparation is pending', async () => {
    vi.useFakeTimers();
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    vi.stubGlobal('fetch', async (url: any) => String(url).includes('oauth2.googleapis.com/token') ? pending : Response.json({}));
    let state: any;
    const work = testing.panel.host.getState().then((value: any) => { state = value; });
    try {
      await vi.advanceTimersByTimeAsync(4001);
      expect(state?.modelOptions).toContain('gemini-3-flash');
      expect(state.signedIn).toBe(true);
    } finally { finish(new Response('offline', { status: 503 })); await work; }
  });
  it('gives account and nonempty key replacements distinct opaque discovery versions', async () => {
    const first = await testing.panel.host.getState();
    home.writeAuth({ antigravity: { accessToken: 'replacement-secret', projectId: 'other-project' } });
    const second = await testing.panel.host.getState();
    expect(second.credentialVersion).not.toBe(first.credentialVersion);
    expect(JSON.stringify(second)).not.toContain('replacement-secret');
    home.writeConfig({ provider: 'custom', customBaseUrl: 'https://synthetic.invalid' });
    const keyed = await testing.panel.host.getState();
    home.writeAuth({ keys: { custom: 'replacement-key-secret' } });
    const replaced = await testing.panel.host.getState();
    expect(replaced.credentialVersion).not.toBe(keyed.credentialVersion);
    expect(JSON.stringify(replaced)).not.toContain('replacement-key-secret');
  });
  it('does not ask Antigravity users for an API key in unsupported editor commands', async () => {
    await testing.commands.get('wisp.setApiKey')!();
    expect(testing.notices.join(' ')).toMatch(/Sign in to Antigravity/);
    testing.notices.length = 0;
    await testing.commands.get('wisp.inquire')!();
    expect(testing.notices.join(' ')).toMatch(/native chat/);
    expect(testing.notices.join(' ')).not.toMatch(/API key/);
  });
  it('refreshes OAuth before active-provider model discovery, without API-key fallback', async () => {
    const ids = await testing.panel.host.fetchModelIds('antigravity');
    expect(ids).toEqual(['gemini-3-flash', 'gemini-3.1-pro-low']);
    const discovery = requests.find(r => r.url.endsWith(':fetchAvailableModels'))!;
    expect(discovery.init.headers.Authorization).toBe('Bearer refreshed');
    expect(home.readAuth().keys?.custom).toBe('preserved');
  });
  it('reports sign-in absence honestly on manual refresh', async () => {
    home.writeAuth({ antigravity: {} });
    await expect(testing.panel.host.fetchModelIds('antigravity')).rejects.toThrow('Sign in to Antigravity');
  });
  it('registers both commands and panel actions, with pending/error state on failure', async () => {
    expect(testing.commands.has('wisp.antigravitySignIn')).toBe(true);
    expect(testing.commands.has('wisp.antigravitySignOut')).toBe(true);
    let reject!: (reason: Error) => void;
    const pending = new Promise<never>((_, fail) => { reject = fail; });
    pending.catch(() => {});
    const open = vi.spyOn(env, 'openExternal').mockReturnValue(pending);
    const signingIn = testing.panel.host.antigravitySignIn();
    try {
      await vi.waitFor(() => expect(open).toHaveBeenCalled(), { timeout: 3000 });
      expect((await testing.panel.host.getState()).authPending).toBe(true);
    } finally {
      reject(new Error('upstream access_token=private'));
      await signingIn;
    }
    const state = await testing.panel.host.getState();
    expect(state.authPending).toBe(false);
    expect(state.authError).toBeTruthy();
    expect(JSON.stringify(state)).not.toContain('private');
    await testing.commands.get('wisp.antigravitySignOut')!();
    expect(home.readAuth().antigravity?.accessToken).toBeUndefined();
    expect(home.readAuth().antigravity?.refreshToken).toBeUndefined();
    expect(home.readAuth().keys?.custom).toBe('preserved');
  });
});
