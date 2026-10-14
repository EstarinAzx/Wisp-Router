import { afterEach, expect, test, vi } from 'vitest';
import * as http from 'http';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { PROVIDERS } from '../src/catalog';
import { desktopTargetIssue } from '../src/codexDesktop';
import { WispHome } from '../src/homeStore';

const homes: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const session = '11111111-1111-4111-8111-111111111111';
const send = (port: number, path: string, body?: unknown, headers: Record<string, string> = { 'session-id': session }) => new Promise<{ status: number; body: any }>((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json', ...headers } }, res => {
    let text = ''; res.on('data', b => text += b); res.on('end', () => resolve({ status: res.statusCode!, body: res.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text }));
  }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
});
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-gemini-bridge-')); homes.push(dir);
  const home = new WispHome(dir); home.saveGeminiApiKey('synthetic-key', null);
  const provider = { id: 'gemini-api', label: 'Gemini API', kind: 'gemini-interactions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-4-argon', apiKeyEnv: '' } as const;
  const calls = { metadata: 0, bearer: 0, backend: 0, generic: 0 };
  const deps: BridgeDeps = {
    providers: [provider], activeProviderId: () => provider.id, modelMap: () => ({}), customBaseUrl: () => '',
    keyFor: async () => { calls.generic++; throw Error('generic key forbidden'); }, clientFor: async () => { calls.generic++; throw Error('generic client forbidden'); },
    codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    effort: () => 'medium', routingMap: () => ({ families: {}, aliases: [{ name: 'argon', target: { providerId: 'gemini-api', model: 'gemini-4-argon' } }] }),
    aliasPickerShowsModel: () => true, aliasOnlyModels: () => false, port: () => 0, accessSecret: () => 'secret', log: () => {},
    desktopNativeModels: () => ['native-model'],
    gemini: { replayContext: () => { calls.metadata++; return home.geminiReplayContext(); }, credentials: c => { calls.bearer++; return home.geminiCredentials(c); },
      assertCurrent: home.assertGeminiCurrent, instructionPolicy: () => 'strict' },
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
const initial = () => ({ model: 'argon', input: [{ role: 'user', content: 'go' }], tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }], store: false });

test.each([1, 2048, 65536, undefined])('production transport preserves explicit/omitted output cap %s', async cap => {
  const { deps, calls } = setup(); const sent: any[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.backend++; sent.push(JSON.parse(init.body as string));
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }] });
  });
  await run(deps, async port => {
    const result = await send(port, '/v1/responses', { ...initial(), ...(cap === undefined ? {} : { max_output_tokens: cap }) });
    expect(result.status).toBe(200); expect(result.body.output[1].content[0].text).toBe('done');
  });
  expect(calls).toEqual({ metadata: 1, bearer: 1, backend: 1, generic: 0 });
  expect(sent[0].generation_config).toEqual({ thinking_level: 'medium', ...(cap === undefined ? {} : { max_output_tokens: cap }) });
});

test.each([0, -1, 1.5, 65537, null, '2048', '', true, false, {}, []].map(cap => ({ cap })))
  ('invalid output cap $cap refuses before metadata, credentials or transport', async ({ cap }) => {
    const { deps, calls } = setup();
    vi.stubGlobal('fetch', async () => { calls.backend++; throw Error('unexpected backend'); });
    await run(deps, async port => {
      expect((await send(port, '/v1/responses', { ...initial(), max_output_tokens: cap })).status).toBe(400);
    });
    expect(calls).toEqual({ metadata: 0, bearer: 0, backend: 0, generic: 0 });
  });

test('explicit caps do not widen generic Responses or signed Desktop admission', async () => {
  const { deps, calls } = setup();
  vi.stubGlobal('fetch', async () => { calls.backend++; throw Error('unexpected backend'); });
  await run(deps, async port => {
    const result = await send(port, '/codex-desktop/v1/responses', { ...initial(), max_output_tokens: 2048 }, { 'session-id': session, 'x-api-key': 'secret' });
    expect(result.status).toBe(400); expect(result.body.error.type).toBe('desktop_target_incompatible');
  });
  const generic = { id: 'custom', label: 'Custom', baseUrl: 'https://synthetic.invalid/v1', defaultModel: 'fixture', apiKeyEnv: '' };
  await run({ ...deps, providers: [generic], activeProviderId: () => generic.id, routingMap: () => ({ families: {}, aliases: [] }) }, async port => {
    const result = await send(port, '/v1/responses', { ...initial(), model: 'custom', max_output_tokens: 2048 });
    expect(result.status).toBe(400); expect(result.body.error.message).toContain('max_output_tokens');
  });
  expect(calls).toEqual({ metadata: 0, bearer: 0, backend: 0, generic: 0 });
});

test('a capped incomplete result releases no executable batch and is never retried', async () => {
  const { deps, calls } = setup();
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.backend++; const sent = JSON.parse(init.body as string);
    expect(sent.generation_config.max_output_tokens).toBe(2048);
    return Response.json({ status: 'incomplete', steps: [{ type: 'function_call', id: 'partial-call', name: sent.tools[0].name, arguments: {} }] });
  });
  await run(deps, async port => {
    const result = await send(port, '/v1/responses', { ...initial(), max_output_tokens: 2048, stream: true });
    expect(result.status).toBe(502);
    expect(result.body.error.type).toBe('gemini_request_refused');
    expect(JSON.stringify(result.body)).not.toMatch(/partial-call|function_call|response\.output/);
  });
  expect(calls).toEqual({ metadata: 1, bearer: 1, backend: 1, generic: 0 });
});

test('Gemini catalog is distinct and never admitted to signed Desktop', () => {
  const p = PROVIDERS.find(p => p.id === 'gemini-api'); expect(p).toBeDefined();
  expect(p?.kind).toBe('gemini-interactions'); expect(p?.keyId).toBeUndefined(); expect(p?.apiKeyEnv).toBe('');
  expect(desktopTargetIssue(p!, 'gemini-4-argon', true)).toMatch(/not.*qualified|unavailable/i);
});

test('unqualified doors and listings refuse before all Gemini and generic credentials', async () => {
  const { deps, calls } = setup();
  await run(deps, async port => {
    for (const path of ['/v1/messages', '/v1/chat/completions', '/codex-desktop/v1/responses']) {
      const result = await send(port, path, { ...initial(), messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }, { 'session-id': session, 'x-api-key': 'secret' });
      expect(result.status).toBe(400);
    }
    for (const headers of [{}, { 'anthropic-version': '2023-06-01' }]) {
      const result = await send(port, '/v1/models', undefined, headers);
      expect(result.status).toBe(200); expect(JSON.stringify(result.body)).not.toMatch(/gemini|argon/);
    }
    expect((await send(port, '/v1/responses', initial(), {})).status).toBe(400);
  });
  expect(calls).toEqual({ metadata: 0, bearer: 0, backend: 0, generic: 0 });
});

test('production Bridge composes full replay and a single fixed transport with original call IDs', async () => {
  const { deps, calls } = setup(); const sent: any[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.backend++; sent.push(JSON.parse(init.body as string));
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('synthetic-key');
    expect(init.redirect).toBe('manual');
    return Response.json(calls.backend === 1 ? { status: 'requires_action', steps: [{ type: 'thought', signature: 'sig' },
      { type: 'function_call', id: 'original', name: sent[0].tools[0].name, arguments: { x: 1 } }] }
      : { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }] });
  });
  await run(deps, async port => {
    const first = await send(port, '/v1/responses', initial()); expect(first.status).toBe(200);
    const next = { ...initial(), stream: true, input: [...initial().input, ...first.body.output, { type: 'function_call_output', call_id: 'original', output: 'result' }] };
    const result = await send(port, '/v1/responses', next); expect(result.status).toBe(200); expect(result.body).toContain('response.completed');
    expect(sent[1].input.slice(1)).toEqual([{ type: 'thought', signature: 'sig' }, { type: 'function_call', id: 'original', name: sent[0].tools[0].name, arguments: { x: 1 } }, { type: 'function_result', call_id: 'original', result: 'result' }]);
    expect(sent[1]).toMatchObject({ store: false, stream: false, background: false, generation_config: { thinking_level: 'medium' } });
  });
  expect(calls).toEqual({ metadata: 2, bearer: 2, backend: 2, generic: 0 });
});

test.each(['before', 'after'])('credential rotation %s dispatch suppresses stale output', async when => {
  const { home, deps, calls } = setup();
  const rotate = () => home.saveGeminiApiKey('new', home.geminiReplayContext()!.lifetime);
  if (when === 'before') deps.gemini!.credentials = c => { calls.bearer++; rotate(); return home.geminiCredentials(c); };
  vi.stubGlobal('fetch', async () => { calls.backend++; rotate(); return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'stale' }] }] }); });
  await run(deps, async port => {
    const result = await send(port, '/v1/responses', { ...initial(), stream: true });
    expect(result.status).toBe(400); expect(JSON.stringify(result.body)).not.toContain('stale');
  });
  expect(calls.backend).toBe(when === 'before' ? 0 : 1);
});

test('strict policy refuses leading developer text before metadata; explicit Gemini policy permits it', async () => {
  const { deps, calls } = setup(); const value = { ...initial(), instructions: 'root', input: [{ role: 'developer', content: 'developer' }, ...initial().input] };
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.backend++; expect(JSON.parse(init.body as string).system_instruction).toBe('root\n\ndeveloper');
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }] });
  });
  await run(deps, async port => {
    expect((await send(port, '/v1/responses', value)).status).toBe(400);
    expect(calls).toEqual({ metadata: 0, bearer: 0, backend: 0, generic: 0 });
    deps.gemini!.instructionPolicy = () => 'prepend-leading-developer-v1';
    expect((await send(port, '/v1/responses', value)).status).toBe(200);
  });
});

test('configured effort applies when the client omits it and invalid effort refuses before metadata', async () => {
  const { deps, calls } = setup(); let effort = 'high'; deps.effort = () => effort;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.backend++; expect(JSON.parse(init.body as string).generation_config.thinking_level).toBe('high');
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }] });
  });
  await run(deps, async port => {
    expect((await send(port, '/v1/responses', initial())).status).toBe(200);
    effort = 'xhigh';
    expect((await send(port, '/v1/responses', initial())).status).toBe(400);
    expect(calls.metadata).toBe(1); expect(calls.backend).toBe(1);
  });
});

test('disconnect while resolving the bearer prevents backend dispatch', async () => {
  const { deps, calls, home } = setup(); let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
  deps.gemini!.credentials = async c => { calls.bearer++; entered(); await gate; return home.geminiCredentials(c); };
  vi.stubGlobal('fetch', async () => { calls.backend++; throw Error('must not dispatch'); });
  await run(deps, async port => {
    const req = http.request({ host: '127.0.0.1', port, path: '/v1/responses', method: 'POST', headers: { authorization: 'Bearer secret', 'session-id': session } });
    req.on('error', () => {}); req.end(JSON.stringify(initial())); await ready;
    const closed = new Promise<void>(r => req.once('close', r)); req.destroy(); await closed;
    await new Promise(r => setTimeout(r, 20)); release(); await new Promise(r => setTimeout(r, 20));
  });
  expect(calls.backend).toBe(0);
});
