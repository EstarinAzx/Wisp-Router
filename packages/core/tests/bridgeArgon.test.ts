import { afterEach, expect, test, vi } from 'vitest';
import * as http from 'http';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { createAntigravityReplayContext } from '../src/antigravity';
import { WispHome } from '../src/homeStore';

const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('wisp-argon-bridge-')) throw Error('Unsafe fixture cleanup');
  rmSync(root, { recursive: true, force: true });
} });
const session = '11111111-1111-4111-8111-111111111111';
const post = (port: number, path: string, body: unknown) => new Promise<{ status: number; body: any }>((resolve, reject) => {
  const request = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: {
    authorization: 'Bearer secret', 'x-api-key': 'secret', 'content-type': 'application/json', session_id: session,
  } }, response => {
    let text = ''; response.on('data', part => text += part);
    response.on('end', () => resolve({ status: response.statusCode!, body: response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text }));
  }); request.on('error', reject); request.end(JSON.stringify(body));
});
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'wisp-argon-bridge-')); roots.push(root);
  const home = new WispHome(root);
  home.writeAuth({ bridgeSecret: 'secret', antigravity: { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', projectId: 'synthetic-project', expiresAt: Date.now() + 3600000 } });
  const provider = { id: 'antigravity', label: 'Antigravity', kind: 'antigravity-oauth', baseUrl: 'https://daily-cloudcode-pa.googleapis.com', defaultModel: 'gemini-4-argon-low', apiKeyEnv: '' } as const;
  const calls = { context: 0, credentials: 0, backend: 0, generic: 0 };
  vi.stubGlobal('fetch', async () => { calls.backend++; throw Error('Unconfigured fixture transport'); });
  const deps: BridgeDeps = {
    providers: [provider], activeProviderId: () => provider.id, modelMap: () => ({}), customBaseUrl: () => '',
    keyFor: async () => { calls.generic++; throw Error('API key forbidden'); }, clientFor: async () => { calls.generic++; throw Error('Generic client forbidden'); },
    codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    antigravitySignedIn: async () => true, antigravityCreds: async () => { calls.credentials++; return home.readAuth().antigravity; },
    antigravityReplayContext: () => { calls.context++; const auth = home.readAuth(); return createAntigravityReplayContext(auth.antigravity, auth.bridgeSecret); },
    effort: () => 'medium', routingMap: () => ({ families: {}, aliases: [{ name: 'argon', target: { providerId: provider.id, model: provider.defaultModel } }] }),
    aliasPickerShowsModel: () => true, aliasOnlyModels: () => false, port: () => 0, accessSecret: () => 'secret', log: () => {},
    desktopNativeModels: () => ['native-model'], desktopAntigravityHoisting: () => true,
    desktopAntigravityTargets: [{ providerId: provider.id, model: provider.defaultModel }],
  };
  return { home, provider, calls, deps };
};
const run = async (deps: BridgeDeps, action: (port: number) => Promise<void>) => {
  const listener = http.createServer();
  const port = await new Promise<number>(resolve => listener.listen(0, '127.0.0.1', () => resolve((listener.address() as import('net').AddressInfo).port)));
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const bridge = createBridgeServer({ ...deps, port: () => port }); await bridge.start();
  try { await action(port); } finally { await bridge.stop(); }
};
const initial = () => ({ model: 'argon', instructions: 'ROOT', input: [{ role: 'developer', content: 'POLICY' }, { role: 'user', content: 'Read both.' }],
  tools: [{ type: 'function', name: 'get_number', parameters: { type: 'object', properties: { label: { type: 'string' } } } }],
  reasoning: { effort: 'low' }, max_output_tokens: 2048, store: false });
const native = (parts: any[]) => ({ response: { modelVersion: 'gemini-4-argon', candidates: [{ finishReason: 'STOP', content: { role: 'model', parts } }],
  usageMetadata: { promptTokenCount: 108, candidatesTokenCount: 40, thoughtsTokenCount: 0 } } });

test.each(['/v1/responses', '/codex-desktop/v1/responses'])('real HTTP %s preserves original state through two turns without API credentials', async endpoint => {
  const f = setup(), sent: any[] = []; let firstParts: any[];
  delete f.deps.desktopAntigravityTargets; // Exercise the release admission policy, including signed HTTP.
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    f.calls.backend++; expect(String(url)).toBe('https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent');
    expect(init.redirect).toBe('error'); const wire = JSON.parse(String(init.body)); sent.push(wire);
    expect(wire.request.generationConfig.maxOutputTokens).toBe(2048);
    if (sent.length === 1) {
      const name = wire.request.tools[0].functionDeclarations[0].name;
      firstParts = [{ functionCall: { id: 'native-left', name, args: { label: 'LEFT' } }, thoughtSignature: 'SYNTHETIC_OPAQUE_STATE' },
        { functionCall: { id: 'native-right', name, args: { label: 'RIGHT' } } }];
      return Response.json(native(firstParts));
    }
    expect(wire.request.contents[1].parts).toEqual(firstParts!);
    expect(wire.request.contents[2].parts.map((part: any) => [part.functionResponse.id, part.functionResponse.response.result])).toEqual([['native-left', '17'], ['native-right', '25']]);
    return Response.json(native([{ text: 'SUM=42' }]));
  });
  await run(f.deps, async port => {
    const first = await post(port, endpoint, initial()); expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.output.map((item: any) => item.type)).toEqual(['reasoning', 'function_call', 'function_call']);
    expect(first.body.output.slice(1).map((item: any) => item.call_id)).toEqual(['native-left', 'native-right']);
    expect(JSON.stringify(first.body)).not.toContain('SYNTHETIC_OPAQUE_STATE');
    f.home.writeAuth({ antigravity: { ...f.home.readAuth().antigravity, accessToken: 'renewed-access' } });
    const second = await post(port, endpoint, { ...initial(), stream: true, input: [...initial().input, ...first.body.output,
      { type: 'function_call_output', call_id: 'native-right', output: '25' }, { type: 'function_call_output', call_id: 'native-left', output: '17' }] });
    expect(second.status, String(second.body)).toBe(200); expect(second.body).toContain('response.completed'); expect(second.body).toContain('SUM=42');
    expect(second.body).not.toContain('SYNTHETIC_OPAQUE_STATE');
  });
  expect(f.calls.backend).toBe(2); expect(f.calls.credentials).toBe(2); expect(f.calls.generic).toBe(0);
});

test('unsupported request shape refuses before reading credentials', async () => {
  const f = setup(); vi.stubGlobal('fetch', async () => { f.calls.backend++; throw Error('forbidden'); });
  await run(f.deps, async port => { expect((await post(port, '/v1/responses', { ...initial(), unknown_field: true })).status).toBe(400); });
  expect(f.calls).toEqual({ context: 0, credentials: 0, backend: 0, generic: 0 });
});
test.each([undefined, 4096, 512])('an explicit server ceiling bounds caller output limit %s without enlarging it', async cap => {
  const f = setup(); f.deps.antigravityOutputTokenLimit = 1024;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    f.calls.backend++; expect(JSON.parse(String(init.body)).request.generationConfig.maxOutputTokens).toBe(Math.min(cap ?? 1024, 1024));
    return Response.json(native([{ text: 'bounded' }]));
  });
  await run(f.deps, async port => {
    const request: any = initial(); if (cap === undefined) delete request.max_output_tokens; else request.max_output_tokens = cap;
    expect((await post(port, '/v1/responses', request)).status).toBe(200);
  });
  expect(f.calls.backend).toBe(1);
});
test('an invalid server ceiling refuses before credentials or provider work', async () => {
  const f = setup(); f.deps.antigravityOutputTokenLimit = 0;
  vi.stubGlobal('fetch', async () => { f.calls.backend++; return Response.json(native([{ text: 'forbidden' }])); });
  await run(f.deps, async port => { expect((await post(port, '/v1/responses', initial())).status).toBe(503); });
  expect(f.calls).toEqual({ context: 0, credentials: 0, backend: 0, generic: 0 });
});
test('a first conversation can use the normal missing-project bootstrap before deriving replay state', async () => {
  const f = setup(); f.home.writeAuth({ antigravity: { ...f.home.readAuth().antigravity, projectId: undefined } });
  f.deps.antigravityCreds = async () => { f.calls.credentials++; f.home.writeAuth({ antigravity: { ...f.home.readAuth().antigravity, projectId: 'bootstrapped-project' } }); return f.home.readAuth().antigravity; };
  vi.stubGlobal('fetch', async () => { f.calls.backend++; return Response.json(native([{ text: 'ready' }])); });
  await run(f.deps, async port => { expect((await post(port, '/v1/responses', initial())).status).toBe(200); });
  expect(f.calls.credentials).toBe(1); expect(f.calls.backend).toBe(1);
});
test('unbound historical state cannot trigger project bootstrap or credential refresh', async () => {
  const f = setup(); f.home.writeAuth({ antigravity: { ...f.home.readAuth().antigravity, projectId: undefined } });
  await run(f.deps, async port => {
    const reply = await post(port, '/v1/responses', { ...initial(), input: [...initial().input,
      { type: 'reasoning', summary: [], encrypted_content: 'wisp.antigravity.v1.' + Buffer.alloc(40).toString('base64url') }] });
    expect(reply.status).toBe(401);
  });
  expect(f.calls.credentials).toBe(0); expect(f.calls.backend).toBe(0);
});
test.each(['refreshToken', 'accessToken'])('a %s change during generation suppresses all executable output', async field => {
  const f = setup();
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    f.calls.backend++; const wire = JSON.parse(String(init.body));
    f.home.writeAuth({ antigravity: { ...f.home.readAuth().antigravity, [field]: 'changed-credential' } });
    return Response.json(native([{ functionCall: { id: 'must-not-execute', name: wire.request.tools[0].functionDeclarations[0].name, args: { label: 'LEFT' } } }]));
  });
  await run(f.deps, async port => {
    const reply = await post(port, '/v1/responses', { ...initial(), stream: true });
    expect(reply.status).toBe(409); expect(JSON.stringify(reply.body)).not.toContain('must-not-execute');
  });
  expect(f.calls.backend).toBe(1);
});
test('public signed admission still requires explicit instruction-hoisting consent before provider work', async () => {
  const f = setup(); delete f.deps.desktopAntigravityTargets;
  f.deps.desktopAntigravityHoisting = () => false;
  await run(f.deps, async port => { expect((await post(port, '/codex-desktop/v1/responses', initial())).status).toBe(400); });
  expect(f.calls).toEqual({ context: 0, credentials: 0, backend: 0, generic: 0 });
});

test.each(['/v1/messages', '/v1/chat/completions'])('unqualified %s cannot start an Argon conversation that loses replay state', async endpoint => {
  const f = setup(); vi.stubGlobal('fetch', async () => { f.calls.backend++; return Response.json(native([{ text: 'must not dispatch' }])); });
  await run(f.deps, async port => {
    const reply = await post(port, endpoint, { model: 'argon', messages: [{ role: 'user', content: 'go' }], max_tokens: 16, stream: true });
    expect(reply.status).toBe(400); expect(JSON.stringify(reply.body)).toMatch(/Responses/);
  });
  expect(f.calls).toEqual({ context: 0, credentials: 0, backend: 0, generic: 0 });
});
