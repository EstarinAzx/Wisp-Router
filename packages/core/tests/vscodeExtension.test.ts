import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('vscode', () => import('./fixtures/vscode'));
vi.mock('@wisp/core', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/index')>();
  const { env } = await import('./fixtures/vscode');
  return { ...actual, AntigravityAuth: class extends actual.AntigravityAuth {
    // The core auth suite owns the fixed-port roundtrip; this host test owns pending/error dispatch.
    signIn = async () => { await env.openExternal('https://synthetic.invalid'); return {}; };
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
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});
describe('extension Antigravity wiring', () => {
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
    const open = vi.spyOn(env, 'openExternal').mockReturnValue(pending);
    const signingIn = testing.panel.host.antigravitySignIn();
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    expect((await testing.panel.host.getState()).authPending).toBe(true);
    reject(new Error('upstream access_token=private'));
    await signingIn;
    const state = await testing.panel.host.getState();
    expect(state.authPending).toBe(false);
    expect(state.authError).toBeTruthy();
    expect(JSON.stringify(state)).not.toContain('private');
    await testing.commands.get('wisp.antigravitySignOut')!();
    expect(home.readAuth().antigravity).toEqual({});
    expect(home.readAuth().keys?.custom).toBe('preserved');
  });
});
