// Opt-in: bun packages/tui/tests/nativeCodexContext.check.ts <fresh evidence directory>
// WISP_NATIVE_LAUNCH optionally selects a compiled launcher (JSON argv array).
// Actual Codex, synthetic account metadata and loopback Responses only; real settings stay untouched.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { PROVIDERS } from '@wisp/core';
import { resolveCodex } from '../src/codex-wisp';

assert(Bun.semver.satisfies(process.versions.bun!, '>=1.4.2'));
assert(process.argv[2], 'Supply a fresh evidence directory');
const output = resolve(process.argv[2]);
assert(!existsSync(output), 'Evidence directory already exists');
mkdirSync(output, { recursive: true });
const save = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2));
const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|pathext|temp|tmp)$/i.test(key)));
const installed = resolveCodex(env);
const version = spawnSync(installed.file, [...installed.args, '--version'], { env, windowsHide: true, encoding: 'utf8' });
assert.equal(version.status, 0); assert.equal(version.stdout.trim(), 'codex-cli 0.167.1');
const launcher: string[] = process.env.WISP_NATIVE_LAUNCH ? JSON.parse(process.env.WISP_NATIVE_LAUNCH)
  : [process.execPath, resolve(import.meta.dir, '../src/codex-wisp.ts')];
const listen = async (server: ReturnType<typeof createServer>) => {
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  return (server.address() as { port: number }).port;
};
const blocked: string[] = [], requests: any[] = [], reports: unknown[] = [];
const proxy = createServer((req, res) => { blocked.push(req.url!); res.writeHead(502); res.end(); });
proxy.on('connect', (req, socket) => { blocked.push(req.url!); socket.end('HTTP/1.1 502 Blocked\r\n\r\n'); });
const proxyPort = await listen(proxy);
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(401); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push({ url: req.url, authorization: req.headers.authorization, body });
  const item = { id: 'msg_context', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'CONTEXT_OK', annotations: [] }] };
  const response = { id: 'resp_context', object: 'response', created_at: 1, status: 'completed', model: body.model, output: [item], usage: { input_tokens: 100, output_tokens: 5, total_tokens: 105 } };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end([{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }]
    .map((event, sequence_number) => `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join(''));
});
const port = await listen(server);
try {
  for (const override of [false, true]) {
    const label = override ? 'configured' : 'defaults';
    const home = join(output, label); mkdirSync(home);
    const wisp = join(home, 'wisp'); mkdirSync(join(wisp, 'cache'), { recursive: true });
    const config = 'cli_auth_credentials_store="file"\nweb_search="disabled"\nsandbox_mode="read-only"\napproval_policy="never"\n'
      + (override ? 'model_context_window=1000000\nmodel_auto_compact_token_limit=900000\n' : '');
    const auth = '{"OPENAI_API_KEY":"synthetic-native"}';
    writeFileSync(join(home, 'config.toml'), config); writeFileSync(join(home, 'auth.json'), auth);
    const modelIds = ['fixture-million', 'fixture-half-million', 'fixture-default-max', 'fixture-unknown'];
    const wispConfig = JSON.stringify({ bridge: { port }, routing: { families: {}, aliases: modelIds.map(model => ({ name: model, target: { providerId: 'codex', model } })) } });
    const wispAuth = JSON.stringify({ bridgeSecret: 'synthetic-bridge', codex: { accessToken: 'synthetic-access', accountId: 'synthetic-context-account' } });
    writeFileSync(join(wisp, 'config.json'), wispConfig); writeFileSync(join(wisp, 'auth.json'), wispAuth);
    const scope = createHash('sha256').update(`${PROVIDERS.find(p => p.id === 'codex')!.baseUrl}\nsynthetic-context-account`).digest('hex');
    writeFileSync(join(wisp, 'cache', `codex-${scope}.json`), JSON.stringify({ schema: 1, fetchedAt: Date.now(), clientVersion: '0.167.1', models: [
      { id: modelIds[0], name: 'Million', visible: true, contextWindow: 1048576 },
      { id: modelIds[1], name: 'Half million', visible: true, contextWindow: 500000 },
      { id: modelIds[2], name: 'Default and max', visible: true, contextWindow: 272000, maxContextWindow: 872000 },
    ] }));
    const childEnv = { ...env, HOME: home, USERPROFILE: home, CODEX_HOME: home, CODEX_SQLITE_HOME: home, WISP_HOME: wisp, APPDATA: home, LOCALAPPDATA: home,
      HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, ALL_PROXY: `http://127.0.0.1:${proxyPort}` };
    const child = spawn(launcher[0], [...launcher.slice(1), 'app-server', '--listen', 'stdio://'], { cwd: home, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const events: any[] = [], queue: any[] = []; let waiter: ((value: any) => void) | undefined, buffer = '', stderr = '', id = 0;
    const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + '\n');
    const exited = new Promise<number | null>((yes, no) => { child.once('error', no); child.once('close', yes); });
    child.stderr.on('data', data => stderr += data);
    child.stdout.on('data', data => {
      buffer += data; let n: number;
      while ((n = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, n); buffer = buffer.slice(n + 1); if (!line) continue;
        const event = JSON.parse(line); events.push(event);
        if (waiter) { const notify = waiter; waiter = undefined; notify(event); } else queue.push(event);
      }
    });
    const read = () => queue.length ? Promise.resolve(queue.shift()) : new Promise<any>((yes, no) => {
      const timer = setTimeout(() => { waiter = undefined; no(new Error(`Native timeout: ${stderr}`)); }, 20000);
      waiter = event => { clearTimeout(timer); yes(event); };
    });
    const rpc = async (method: string, params: unknown) => {
      const key = ++id; send({ id: key, method, params });
      for (;;) { const event = await read(); if (event.id === key) { assert(!event.error, JSON.stringify(event)); return event.result; } }
    };
    try {
      await rpc('initialize', { clientInfo: { name: 'wisp-context-check', version: '1.0' }, capabilities: { experimentalApi: true } });
      send({ method: 'initialized', params: {} });
      const effective = (await rpc('config/read', { includeLayers: false })).config;
      if (override) { assert.equal(effective.model_context_window, 1000000); assert.equal(effective.model_auto_compact_token_limit, 900000); }
      const models = (await rpc('model/list', { includeHidden: false, limit: 1000 })).data;
      assert(modelIds.every(model => models.some((row: any) => row.id === model)));
      const thread = (await rpc('thread/start', { model: modelIds[0], cwd: home, approvalPolicy: 'never', sandbox: 'read-only' })).thread.id;
      const windows: (number | null)[] = [];
      for (const model of modelIds) {
        const start = events.length;
        await rpc('turn/start', { threadId: thread, model, input: [{ type: 'text', text: `Synthetic context check ${model}` }] });
        for (;;) { const event = await read(); if (event.method === 'turn/completed') { assert.equal(event.params.turn.status, 'completed', JSON.stringify(event)); break; } }
        const turnEvents = events.slice(start);
        assert(turnEvents.some(event => event.method === 'item/completed' && event.params.item.type === 'agentMessage' && event.params.item.text === 'CONTEXT_OK'));
        const usage = turnEvents.filter(event => event.method === 'thread/tokenUsage/updated').at(-1);
        assert(usage, 'Missing native context report'); windows.push(usage.params.tokenUsage.modelContextWindow);
        assert.equal(requests.at(-1).body.model, model, 'Native model switch lost');
      }
      // Unknown targets retain native fallback semantics; they are not advertised as verified capacities.
      assert.deepEqual(windows, override ? [950000, 475000, 828400, 950000] : [996147, 475000, 258400, 258400]);
      reports.push({ label, windows, modelSwitchWithinThread: true, settingsUnchanged: true });
      assert.equal(readFileSync(join(home, 'config.toml'), 'utf8'), config);
      assert.equal(readFileSync(join(home, 'auth.json'), 'utf8'), auth);
      assert.equal(readFileSync(join(wisp, 'config.json'), 'utf8'), wispConfig);
      assert.equal(readFileSync(join(wisp, 'auth.json'), 'utf8'), wispAuth);
      child.stdin.end();
      const timeout = setTimeout(() => child.kill(), 5000);
      try { assert.equal(await exited, 0); } finally { clearTimeout(timeout); }
    } finally {
      save(`${label}-events.json`, events); save(`${label}-stderr.json`, stderr);
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else child.kill('SIGKILL');
      }
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    }
  }
  assert(requests.every(request => request.url === '/v1/responses' && request.authorization === 'Bearer synthetic-bridge'));
  save('result.json', { version: version.stdout.trim(), launcher, reports, requests: requests.length, blocked, passed: true });
  console.log(JSON.stringify(reports));
} finally {
  save('requests.json', requests);
  for (const listener of [server, proxy]) { listener.closeAllConnections(); await new Promise<void>(yes => listener.close(() => yes())); }
}
