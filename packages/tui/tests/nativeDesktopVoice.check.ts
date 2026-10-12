// bun packages/tui/tests/nativeDesktopVoice.check.ts <codex.exe>
// Actual helper + production setup/Bridge, synthetic native upstream. No microphone or real provider.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBridgeServer } from '../../core/src/bridgeServer';
import { desktopAction } from '../src/codexDesktop';

assert(Bun.semver.satisfies(process.versions.bun!, '>=1.4.2'), 'Requires Bun >=1.4.2');
const binary = process.argv[2]; assert(binary, 'Supply the actual Desktop helper path');
const version = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true }); assert.equal(version.status, 0);
const folder = mkdtempSync(join(tmpdir(), 'wisp-voice-check-')); const codexHome = join(folder, 'codex'); const wispHome = join(folder, 'wisp'); mkdirSync(codexHome); mkdirSync(wispHome);
const out = resolve(import.meta.dir, '../../../out', `desktop-voice-${Date.now()}`); mkdirSync(out, { recursive: true });
const observed: { kind: string; path: string; nativeAuth: boolean; localSecret: boolean }[] = []; const messages: string[] = [];
let opens = 0, closes = 0;
const upstream = Bun.serve({ hostname: '127.0.0.1', port: 0,
  fetch(req, server) {
    const path = new URL(req.url).pathname;
    observed.push({ kind: 'sideband', path, nativeAuth: req.headers.get('authorization') === 'Bearer synthetic-native', localSecret: req.headers.has('x-api-key') });
    assert.match(path, /^\/v1\/live\/rtc_fixture_\d+$/);
    if (server.upgrade(req)) return undefined;
    return new Response('Upgrade required', { status: 400 });
  },
  websocket: { open(ws) { opens++; ws.send(JSON.stringify({ type: 'session.started', session: { id: 'voice_fixture', instructions: 'synthetic' } })); }, message(_ws, message) { messages.push(String(message)); }, close() { closes++; } },
});
const listen = (server: ReturnType<typeof createServer>): Promise<number> => new Promise(r => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)));
const spare = createServer(); const port = await listen(spare); await new Promise<void>(r => spare.close(() => r()));
const proxy = createServer((_req, res) => { res.writeHead(502); res.end(); }); proxy.on('connect', (_req, socket) => socket.end('HTTP/1.1 502 Blocked\r\n\r\n')); const proxyPort = await listen(proxy);
let call = 0;
const bridge = createBridgeServer({ providers: [], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => '', clientFor: async () => undefined,
  codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
  effort: () => 'medium', activeProviderId: () => '', routingMap: () => ({ families: {}, aliases: [] }), aliasPickerShowsModel: () => false, aliasOnlyModels: () => false,
  port: () => port, accessSecret: () => 'synthetic-local', log: () => {},
  nativeFetch: async (url, init) => {
    assert.equal(url, 'https://chatgpt.com/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas');
    const headers = new Headers(init.headers); const body = JSON.parse(init.body as string); assert.equal(body.sdp, 'v=offer\r\n'); assert.equal(body.session.model, 'gpt-live-1-codex');
    observed.push({ kind: 'call', path: new URL(url).pathname, nativeAuth: headers.get('authorization') === 'Bearer synthetic-native', localSecret: headers.has('x-api-key') });
    return new Response('v=answer\r\n', { status: 201, headers: { location: `/v1/live/rtc_fixture_${++call}`, 'content-type': 'application/sdp' } });
  },
  nativeVoiceRequest: (url, options) => { assert.equal(url.origin, 'https://api.openai.com'); return request(`http://127.0.0.1:${upstream.port}${url.pathname}${url.search}`, options); },
});
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|pathext|temp|tmp|appdata|localappdata)$/i.test(key)));
Object.assign(env, { CODEX_HOME: codexHome, CODEX_SQLITE_HOME: codexHome, WISP_HOME: wispHome, USERPROFILE: folder, HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, ALL_PROXY: `http://127.0.0.1:${proxyPort}`, NO_PROXY: '127.0.0.1,localhost,::1' });
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = `${encode({ alg: 'none' })}.${encode({ email: 'fixture@example.invalid', 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account', chatgpt_plan_type: 'plus' } })}.fixture`;
writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: token, access_token: 'synthetic-native', refresh_token: 'synthetic-refresh', account_id: 'synthetic-account' }, last_refresh: new Date().toISOString() }));
const original = 'model="gpt-5.5"\ncli_auth_credentials_store="file"\n[features]\nrealtime_conversation=true\n[realtime]\nversion="v3"\ntype="conversational"\n'; writeFileSync(join(codexHome, 'config.toml'), original);
writeFileSync(join(wispHome, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-local' })); writeFileSync(join(wispHome, 'config.json'), JSON.stringify({ bridge: { port } }));
let child: ReturnType<typeof spawn> | undefined; let stderr = ''; const events: any[] = [];
const until = async (condition: () => boolean) => { const deadline = Date.now() + 5000; while (!condition() && Date.now() < deadline) await new Promise(r => setTimeout(r, 10)); assert(condition(), 'Fixture condition timed out'); };
try {
  await bridge.start();
  const catalogRun = spawnSync(binary, ['debug', 'models', '--bundled'], { env, cwd: folder, encoding: 'utf8', windowsHide: true }); assert.equal(catalogRun.status, 0);
  const native = JSON.parse(catalogRun.stdout);
  await desktopAction('enable', { codexHome, wispHome, catalogs: async () => ({ native, input: native }), capabilities: async () => () => undefined });
  child = spawn(binary, ['app-server', '--listen', 'stdio://'], { cwd: folder, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const queue: any[] = []; let waiter: ((v: any) => void) | undefined; let buffer = '', id = 0;
  child.stderr!.on('data', data => stderr += data);
  child.stdout!.on('data', data => { buffer += data; let end; while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line) continue; const v = JSON.parse(line); events.push(v); if (waiter) { const deliver = waiter; waiter = undefined; deliver(v); } else queue.push(v); } });
  const send = (v: unknown) => child!.stdin!.write(JSON.stringify(v) + '\n');
  const read = () => queue.length ? Promise.resolve(queue.shift()) : new Promise<any>((resolveRead, reject) => { const timer = setTimeout(() => { waiter = undefined; reject(new Error('Helper timeout')); }, 15000); waiter = v => { clearTimeout(timer); resolveRead(v); }; });
  const rpc = async (method: string, params: unknown) => { const key = ++id; send({ id: key, method, params }); while (true) { const v = await read(); if (v.id === key) { assert(!v.error, JSON.stringify(v)); return v.result; } } };
  await rpc('initialize', { clientInfo: { name: 'wisp-voice-check', version: '1' }, capabilities: { experimentalApi: true } }); send({ method: 'initialized', params: {} });
  const thread = await rpc('thread/start', { cwd: folder, approvalPolicy: 'never', sandbox: 'read-only' });
  for (let round = 1; round <= 2; round++) {
    await rpc('thread/realtime/start', { threadId: thread.thread.id, transport: { type: 'webrtc', sdp: 'v=offer\r\n' }, version: 'v3', outputModality: 'audio', includeStartupContext: false, prompt: 'Synthetic local fixture' });
    await until(() => opens === round && events.filter(v => v.method === 'thread/realtime/sdp').length === round);
    assert.equal(events.filter(v => v.method === 'thread/realtime/sdp').at(-1).params.sdp, 'v=answer\r\n');
    await rpc('thread/realtime/appendText', { threadId: thread.thread.id, text: `fixture message ${round}` });
    await until(() => messages.some(v => v.includes(`fixture message ${round}`)));
    await rpc('thread/realtime/stop', { threadId: thread.thread.id }); await until(() => closes === round);
  }
  assert.equal(observed.length, 4); assert(observed.every(v => v.nativeAuth && !v.localSecret));
  await desktopAction('disable', { codexHome, wispHome }); assert.equal(readFileSync(join(codexHome, 'config.toml'), 'utf8'), original);
  const result = { version: version.stdout.trim(), runtime: process.versions.bun, calls: call, opens, closes, headerIsolation: true, setupRestore: true, observed, scope: 'Actual helper + production Bridge; synthetic native endpoints. No real audio/provider/UI.' };
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); console.log(`Evidence: ${out}`);
} finally {
  writeFileSync(join(out, 'stderr.txt'), stderr); writeFileSync(join(out, 'events.json'), JSON.stringify(events, null, 2));
  if (child) { child.stdin?.end(); if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill(); child.stdout?.destroy(); child.stderr?.destroy(); }
  bridge.stop(); upstream.stop(true); proxy.closeAllConnections(); await new Promise<void>(r => proxy.close(() => r()));
}
