// bun packages/tui/tests/nativeDesktop.check.ts — CLI app-server evidence, not desktop UI acceptance.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBridgeServer, type BridgeDeps } from '../../core/src/bridgeServer';
import { desktopAction } from '../src/codexDesktop';
import { resolveCodex } from '../src/codex-wisp';

assert(Bun.semver.satisfies(process.versions.bun!, '>=1.4.2'), 'Requires pinned Bun >=1.4.2');
const xai = process.argv.includes('--xai');
const searchMode = process.argv.includes('--cached-search') ? 'cached' : 'live';
const providerId = xai ? 'xai' : 'opencode-go';
const aliasTarget = xai ? 'grok-4.6' : 'PINNED_ALIAS', overrideTarget = xai ? 'grok-4.5' : 'PINNED_OVERRIDE';
const root = resolve(import.meta.dir, '../../..'); const out = join(root, 'out', `desktop-native-${Date.now()}`); mkdirSync(out, { recursive: true });
const folder = mkdtempSync(join(tmpdir(), 'wisp desktop protocol ')); const codexHome = join(folder, 'codex'); const wispHome = join(folder, 'wisp');
mkdirSync(codexHome); mkdirSync(wispHome);
const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|pathext|temp|tmp|appdata|localappdata)$/i.test(key)));
const installed = resolveCodex(env); const version = spawnSync(installed.file, [...installed.args, '--version'], { env, encoding: 'utf8', windowsHide: true });
assert.equal(version.status, 0); assert.equal(version.stdout.trim(), 'codex-cli 0.154.0', 'This new native contract is pinned separately from nativeCodex.check.ts');
const listen = (s: ReturnType<typeof createServer>): Promise<number> => new Promise(r => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)));
const close = async (s: ReturnType<typeof createServer>) => { s.closeAllConnections(); await new Promise<void>(r => s.close(() => r())); };
const captures: any[] = []; let mode = 'text'; let toolSent = false; let cancelled = false; let nativeStarted = false;
const frame = (res: ServerResponse, value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`);
const upstream = createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c; const body = JSON.parse(raw); captures.push({ kind: 'external', body, headers: req.headers });
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  if (mode === 'tool' && !toolSent) {
    toolSent = true; const tool = body.tools.find((t: any) => (t.function?.description ?? t.description)?.includes('fixture_tool (function)')); assert(tool, 'Native dynamic tool missing at external provider');
    if (xai) {
      const item = { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: tool.name, arguments: '{"value":"tool-input"}' };
      res.end(`event: response.output_item.done\ndata: ${JSON.stringify({ item })}\n\nevent: response.completed\ndata: ${JSON.stringify({ response: { status: 'completed', output: [item] } })}\n\n`); return;
    }
    frame(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_fixture', type: 'function', function: { name: tool.function.name, arguments: '{"value":"tool-input"}' } }] }, finish_reason: 'tool_calls' }] });
  } else if (xai) { res.end(nativeSse(body.model, mode === 'tool' ? 'TOOL_FINAL_OK' : 'EXTERNAL_OK')); return; }
  else frame(res, { choices: [{ delta: { content: mode === 'tool' ? 'TOOL_FINAL_OK' : 'EXTERNAL_OK' }, finish_reason: 'stop' }] });
  res.end('data: [DONE]\n\n');
});
const up = await listen(upstream); const spare = createServer(); const port = await listen(spare); await close(spare);
let proxyHits = 0; const proxy = createServer((_req, res) => { proxyHits++; res.writeHead(502); res.end(); }); proxy.on('connect', (_req, socket) => { proxyHits++; socket.end('HTTP/1.1 502 Blocked\r\n\r\n'); }); const proxyPort = await listen(proxy);
const nativeSse = (model: string, text = 'NATIVE_OK') => {
  const item = { id: 'msg_native', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
  const response = { id: 'resp_native', object: 'response', created_at: 1, status: 'completed', model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  return [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } }, { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text }, { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }]
    .map((event, sequence_number) => `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join('');
};
const routing = () => JSON.parse(readFileSync(join(wispHome, 'config.json'), 'utf8')).routing;
const realFetch = globalThis.fetch; let xaiRequests = 0;
if (xai) globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === 'https://api.x.ai/v1/responses') { xaiRequests++; return realFetch(`http://127.0.0.1:${up}/v1/responses`, init); }
  if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('Native test refuses non-local network');
  return realFetch(url, init);
}) as typeof fetch;
const provider = { id: providerId, label: `Synthetic ${providerId} wire`, baseUrl: `http://127.0.0.1:${up}/v1`, defaultModel: 'WRONG_ACTIVE', apiKeyEnv: '', ...(xai ? { kind: 'xai-oauth' as const } : {}) };
const bridge = createBridgeServer({ providers: [provider], modelMap: () => ({}), customBaseUrl: () => provider.baseUrl, keyFor: async () => 'synthetic-external', clientFor: async () => undefined,
  codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
  xaiCreds: async () => ({ accessToken: 'synthetic-external' }),
  effort: () => 'medium', activeProviderId: () => providerId, routingMap: routing, aliasPickerShowsModel: () => false, aliasOnlyModels: () => false, port: () => port, accessSecret: () => 'synthetic-local', log: () => {},
  desktopNativeModels: () => { const s = JSON.parse(readFileSync(join(wispHome, 'codex-desktop/state.json'), 'utf8')); return s.phase === 'active' ? s.nativeModels : undefined; },
  nativeFetch: async (url, init) => {
    const headers = Object.fromEntries(new Headers(init.headers)); const body = JSON.parse(init.body as string); captures.push({ kind: 'native', url, headers, body }); nativeStarted = true;
    if (mode === 'cancel') return new Promise((_yes, no) => { init.signal!.addEventListener('abort', () => { cancelled = true; no(new Error('cancelled')); }, { once: true }); });
    return new Response(nativeSse(body.model), { headers: { 'content-type': 'text/event-stream' } });
  },
} satisfies BridgeDeps);
const childEnv = { ...env, CODEX_HOME: codexHome, CODEX_SQLITE_HOME: codexHome, WISP_HOME: wispHome, HOME: folder, USERPROFILE: folder,
  HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, ALL_PROXY: `http://127.0.0.1:${proxyPort}`, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' };
const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const token = `${encode({ alg: 'none' })}.${encode({ email: 'fixture@example.invalid', 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account', chatgpt_plan_type: 'plus' } })}.fixture`;
const auth = JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: token, access_token: 'synthetic-native', refresh_token: 'synthetic-refresh', account_id: 'synthetic-account' }, last_refresh: new Date().toISOString() });
writeFileSync(join(codexHome, 'auth.json'), auth);
writeFileSync(join(codexHome, 'config.toml'), `web_search="${searchMode}"\nmodel_reasoning_effort="${xai ? 'medium' : 'none'}"\ncli_auth_credentials_store="file"\n[features]\napps=false\n`);
writeFileSync(join(wispHome, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-local' }));
const wispConfig: any = { bridge: { port }, customBaseUrl: provider.baseUrl, routing: { families: {}, aliases: [{ name: 'wisp-external', target: { providerId, model: aliasTarget } }], codexModels: {} } };
writeFileSync(join(wispHome, 'config.json'), JSON.stringify(wispConfig));
let child: ReturnType<typeof spawn> | undefined; let stderr = ''; const events: any[] = []; let toolCalls = 0;
try {
  await bridge.start();
  const capabilities = async () => () => xai ? { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' } : undefined;
  await desktopAction('enable', { codexHome, wispHome, env: childEnv, capabilities });
  const catalog = JSON.parse(readFileSync(join(wispHome, 'codex-desktop/models.json'), 'utf8'));
  const natives = catalog.models.filter((m: any) => m.visibility === 'list' && m.slug !== 'wisp-external'); assert(natives.length >= 2);
  const native = natives[0].slug; const overridden = natives[1].slug;
  wispConfig.routing.codexModels[overridden] = { providerId, model: overrideTarget }; writeFileSync(join(wispHome, 'config.json'), JSON.stringify(wispConfig));
  await desktopAction('refresh', { codexHome, wispHome, env: childEnv, capabilities });
  child = spawn(installed.file, [...installed.args, 'app-server', '--listen', 'stdio://'], { cwd: folder, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const queue: any[] = []; let waiter: ((value: any) => void) | undefined; let buffer = ''; let id = 0;
  const send = (v: unknown) => child!.stdin!.write(JSON.stringify(v) + '\n');
  child.stderr!.on('data', c => stderr += c);
  child.stdout!.on('data', c => { buffer += c; let n; while ((n = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, n); buffer = buffer.slice(n + 1); if (!line) continue;
    const v = JSON.parse(line); events.push(v);
    if (v.method === 'item/tool/call') { toolCalls++; send({ id: v.id, result: { contentItems: [{ type: 'inputText', text: 'TOOL_RESULT_OK' }], success: true } }); continue; }
    if (waiter) { const w = waiter; waiter = undefined; w(v); } else queue.push(v);
  } });
  const read = () => queue.length ? Promise.resolve(queue.shift()) : new Promise<any>((yes, no) => { const timer = setTimeout(() => { waiter = undefined; no(new Error('app-server timeout')); }, 20000); waiter = v => { clearTimeout(timer); yes(v); }; });
  const rpc = async (method: string, params: unknown) => { const key = ++id; send({ id: key, method, params }); while (true) { const v = await read(); if (v.id === key) { assert(!v.error, JSON.stringify(v)); return v.result; } } };
  await rpc('initialize', { clientInfo: { name: 'wisp-desktop-check', version: '1.0.0' }, capabilities: { experimentalApi: true } }); send({ method: 'initialized', params: {} });
  const account = await rpc('account/read', { refreshToken: false }); assert.equal(account.account.type, 'chatgpt'); assert.equal(account.requiresOpenaiAuth, true);
  const list = await rpc('model/list', { includeHidden: false, limit: 1000 }); assert(list.data.some((m: any) => m.model === 'wisp-external')); assert(list.data.some((m: any) => m.model === native));
  async function turn(model: string, desired: string, existingThread?: string) {
    const result = existingThread ? undefined : await rpc('thread/start', { model, cwd: folder, approvalPolicy: 'never', sandbox: 'read-only', dynamicTools: [{ name: 'fixture_tool', description: 'Local check', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] });
    const threadId = existingThread ?? result.thread.id; const started = await rpc('turn/start', { threadId, input: [{ type: 'text', text: existingThread ? 'Distinct synthetic follow-up' : 'Local synthetic test' }] });
    if (mode === 'cancel') { const until = Date.now() + 10000; while (!nativeStarted && Date.now() < until) await new Promise(r => setTimeout(r, 20)); assert(nativeStarted); await rpc('turn/interrupt', { threadId, turnId: started.turn.id }); }
    let final = ''; while (true) { const v = await read(); if (v.method === 'item/completed' && v.params.item.type === 'agentMessage') final += v.params.item.text;
      if (v.method === 'turn/completed') { assert.equal(v.params.turn.status, mode === 'cancel' ? 'interrupted' : 'completed', JSON.stringify(v)); break; } }
    if (desired) assert.equal(final, desired);
    return threadId;
  }
  const conversation = await turn('wisp-external', 'EXTERNAL_OK');
  await turn('wisp-external', 'EXTERNAL_OK', conversation);
  const replay = captures.at(-1).body;
  assert(xai ? replay.input.some((m: any) => m.role === 'assistant' && m.content.some((p: any) => p.text === 'EXTERNAL_OK')) : replay.messages.some((m: any) => m.role === 'assistant' && m.content === 'EXTERNAL_OK'));
  const replayMessages = xai ? replay.input : replay.messages;
  const assistantIndex = replayMessages.findIndex((m: any) => m.role === 'assistant');
  assert(replayMessages.slice(assistantIndex + 1).some((m: any) => m.role === 'user' && (xai ? m.content.some((p: any) => p.text.includes('Distinct synthetic follow-up')) : JSON.stringify(m.content).includes('Distinct synthetic follow-up'))));
  mode = 'tool'; await turn('wisp-external', 'TOOL_FINAL_OK', conversation); assert.equal(toolCalls, 1);
  assert(captures.some(c => c.kind === 'external' && (xai ? c.body.input.some((m: any) => m.type === 'function_call_output' && m.output.includes('TOOL_RESULT_OK')) : c.body.messages.some((m: any) => m.role === 'tool' && m.content.includes('TOOL_RESULT_OK')))));
  mode = 'text'; await turn(overridden, 'EXTERNAL_OK'); await turn(native, 'NATIVE_OK');
  mode = 'cancel'; nativeStarted = false; await turn(native, ''); await new Promise(r => setTimeout(r, 100)); assert(cancelled);
  for (const c of captures) {
    assert(!c.headers['x-api-key']);
    if (c.kind === 'external') { assert.equal(c.headers.authorization, 'Bearer synthetic-external'); assert.equal(c.body.reasoning_effort, undefined); if (xai) assert.equal(c.body.reasoning.effort, 'medium'); assert(!c.headers['chatgpt-account-id']); assert([aliasTarget, overrideTarget].includes(c.body.model)); }
    else { assert.equal(c.headers.authorization, 'Bearer synthetic-native'); assert.equal(c.headers['chatgpt-account-id'], 'synthetic-account'); assert.equal(c.url, 'https://chatgpt.com/backend-api/codex/responses'); }
  }
  assert.equal(readFileSync(join(codexHome, 'auth.json'), 'utf8'), auth);
  // Signed Codex probes account/plugin endpoints independently. The refusing proxy blocks those;
  // all seven inference requests must instead be accounted for by our two production transports.
  assert.equal(captures.length, 7); assert.equal(captures.filter(c => c.kind === 'native').length, 2);
  if (xai) assert.equal(xaiRequests, 5);
  await desktopAction('disable', { codexHome, wispHome });
  writeFileSync(join(out, 'result.json'), JSON.stringify({ version: version.stdout.trim(), provider: providerId, searchMode, binary: installed, accountType: account.account.type, mixedPicker: true, dualHeaders: 'Native bearer preserved; production signed route separately required configured x-api-key', text: true, toolCalls, nativePassthrough: true, exactOverride: true, cancellation: cancelled, authUnchanged: true, blockedProxyHits: proxyHits, desktopUi: 'PENDING sprint2' }, null, 2));
  console.log(`PASS native signed production path: ${out}`);
} finally {
  globalThis.fetch = realFetch;
  writeFileSync(join(out, 'stderr.txt'), stderr); writeFileSync(join(out, 'events.json'), JSON.stringify(events, null, 2)); writeFileSync(join(out, 'captures.json'), JSON.stringify(captures, null, 2));
  if (child) {
    child.stdin?.end();
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill();
    child.stdout?.destroy(); child.stderr?.destroy();
    await new Promise(r => setTimeout(r, 200));
  }
  bridge.stop(); await close(upstream); await close(proxy);
  try { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { console.error(`Synthetic fixture retained: ${folder}`); }
}
