import { describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => ({ Uri: { joinPath: (_: unknown, ...parts: string[]) => parts.join('/') } }));
import { WispPanelProvider, type PanelHost, type PanelState } from '../../vscode/src/sidePanelProvider';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const setup = (overrides: Partial<PanelHost> = {}) => {
  const sent: any[] = [];
  let receive!: (msg: any) => void;
  const host = { getState: async () => ({ providerId: 'antigravity' } as PanelState), ...overrides } as PanelHost;
  const panel = new WispPanelProvider({} as any, host);
  panel.resolveWebviewView({ webview: {
    asWebviewUri: (u: unknown) => u, cspSource: 'test:',
    postMessage: (msg: any) => { sent.push(msg); },
    onDidReceiveMessage: (fn: typeof receive) => { receive = fn; },
  }, onDidDispose: () => {} } as any);
  return { panel, sent, receive };
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('VS Code panel dispatch', () => {
  it('routes Antigravity account controls to their host actions', async () => {
    let account = 'out';
    const h = setup({ antigravitySignIn: async () => { account = 'in'; }, antigravitySignOut: async () => { account = 'out'; } } as any);
    h.receive({ type: 'antigravitySignIn' }); await flush(); expect(account).toBe('in');
    h.receive({ type: 'antigravitySignOut' }); await flush(); expect(account).toBe('out');
  });
  it('keeps a refreshed list tied to the requested provider even when selection changes', async () => {
    const result = deferred<string[]>(); let requested: string | undefined;
    const h = setup({ fetchModelIds: async (id?: string) => { requested = id; return result.promise; } });
    h.receive({ type: 'refreshModels', providerId: 'antigravity', requestId: 3 });
    result.resolve(['gemini-3-flash']); await flush();
    expect(requested).toBe('antigravity');
    expect(h.sent).toContainEqual({ type: 'models', providerId: 'antigravity', requestId: 3, ids: ['gemini-3-flash'] });
  });
  it('tags refresh errors and never leaks upstream credential text', async () => {
    const h = setup({ fetchModelIds: async () => { throw new Error('access_token=private'); } });
    h.receive({ type: 'refreshModels', providerId: 'antigravity', requestId: 4 }); await flush();
    expect(h.sent).toContainEqual({ type: 'modelsError', providerId: 'antigravity', requestId: 4, message: 'Failed to fetch models.' });
    expect(JSON.stringify(h.sent)).not.toContain('private');
  });
  it('discards a slow previous state after a newer state has arrived', async () => {
    const first = deferred<PanelState>(); let reads = 0;
    const h = setup({ getState: () => ++reads === 1 ? first.promise : Promise.resolve({ providerId: 'codex' } as PanelState) });
    const old = h.panel.postState(); await h.panel.postState();
    first.resolve({ providerId: 'antigravity' } as PanelState); await old;
    expect(h.sent).toEqual([{ type: 'state', state: { providerId: 'codex' } }]);
  });
});
