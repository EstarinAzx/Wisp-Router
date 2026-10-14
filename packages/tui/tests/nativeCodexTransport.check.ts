// Opt-in: bun packages/tui/tests/nativeCodexTransport.check.ts <fresh evidence directory>
// Requires actual codex-cli 0.159.2 and Bun >=1.4.2. Only synthetic loopback traffic.
// Tests the selected provider, raw HTTP and native --last resume across separate launches.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve, sep } from 'node:path';
import { buildCodexLaunch, resolveCodex } from '../src/codex-wisp';

assert(Bun.semver.satisfies(process.versions.bun!, '>=1.4.2'));
assert(process.argv[2], 'Provide a new evidence directory; previous results are never overwritten.');
const output = resolve(process.argv[2]);
assert(!existsSync(output), 'Evidence directory already exists');
mkdirSync(output, { recursive: true });
const home = join(output, 'home'); mkdirSync(home);
const save = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2));
const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|pathext|temp|tmp)$/i.test(key)));
Object.assign(env, { HOME: home, USERPROFILE: home, CODEX_HOME: home, CODEX_SQLITE_HOME: home,
  WISP_HOME: join(home, 'wisp'), APPDATA: home, LOCALAPPDATA: home, WRONG_TOKEN: 'synthetic-wrong' });
const codex = resolveCodex(env);
const version = spawnSync(codex.file, [...codex.args, '--version'], { env, windowsHide: true, encoding: 'utf8' });
assert.equal(version.status, 0); assert.equal(version.stdout.trim(), 'codex-cli 0.159.2');
const blocked: string[] = [], requests: any[] = [], runs: any[] = [], failures: string[] = [];
const listen = async (server: ReturnType<typeof createServer>) => {
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  return (server.address() as { port: number }).port;
};
const proxy = createServer((req, res) => { blocked.push(req.url!); res.writeHead(502); res.end(); });
proxy.on('connect', (req, socket) => { blocked.push(req.url!); socket.end('HTTP/1.1 502 Blocked\r\n\r\n'); });
const proxyPort = await listen(proxy);
Object.assign(env, { HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, ALL_PROXY: `http://127.0.0.1:${proxyPort}` });
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(401); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ url: req.url, headers: req.headers, body });
  const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'TRANSPORT_OK', annotations: [] }] };
  const response = { id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: body.model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end([{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }]
    .map((event, sequence_number) => `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join(''));
});
const port = await listen(server);
const config = `model="wisp-transport-model"\nweb_search="live"\ncli_auth_credentials_store="file"\nsandbox_mode="read-only"\napproval_policy="never"\nmodel_provider="wisp_local"\n[model_providers.wisp_local]\nname="Inherited transport"\nbase_url="http://127.0.0.1:${proxyPort}/poison"\nwire_api="responses"\nenv_key="WRONG_TOKEN"\nrequires_openai_auth=true\nsupports_websockets=true\nexperimental_bearer_token="synthetic-wrong-bearer"\nhttp_headers={Authorization="Bearer synthetic-wrong-header"}\nenv_http_headers={"X-Hostile"="WRONG_TOKEN"}\nquery_params={hostile="inherited"}\n`;
const auth = '{"OPENAI_API_KEY":"synthetic-native-auth"}';
writeFileSync(join(home, 'config.toml'), config); writeFileSync(join(home, 'auth.json'), auth);
mkdirSync(env.WISP_HOME!);
writeFileSync(join(env.WISP_HOME!, 'config.json'), JSON.stringify({ bridge: { port } }));
writeFileSync(join(env.WISP_HOME!, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-bridge' }));

const run = async (label: string, args: string[], inspect = false, expectedExit = 0) => {
  const launch = buildCodexLaunch(port, 'synthetic-bridge', args, env);
  const command = inspect ? [codex.file, ...codex.args, ...launch.args]
    : [process.execPath, resolve(import.meta.dir, '../src/codex-wisp.ts'), ...args];
  const child = spawn(command[0], command.slice(1), { cwd: home, env: launch.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', buffer = '', initialized = false;
  const events: any[] = [];
  const kill = () => {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* Already exited. */ } }
  };
  const timer = setTimeout(kill, 30_000);
  child.stderr.on('data', data => stderr += data);
  child.stdout.on('data', data => {
    stdout += data; buffer += data;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line); events.push(event);
      if (inspect && event.id === 1 && !initialized) {
        initialized = true;
        child.stdin.write('{"method":"initialized","params":{}}\n{"id":2,"method":"config/read","params":{"includeLayers":true}}\n');
      }
      if (inspect && event.id === 2) child.stdin.end();
    }
  });
  if (inspect) child.stdin.write('{"id":1,"method":"initialize","params":{"clientInfo":{"name":"wisp-transport-check","version":"1.0"},"capabilities":{"experimentalApi":true}}}\n');
  else child.stdin.end();
  try {
    const exitCode = await new Promise<number | null>((yes, no) => { child.once('error', no); child.once('close', yes); });
    const result = { label, pid: child.pid, args: launch.args, exitCode, stdout, stderr, events };
    runs.push(result); save(`${label}.json`, result);
    assert.equal(exitCode, expectedExit, `${label}: ${stderr}`);
    if (expectedExit === 1) assert(stderr.includes('conflicting native provider settings'), stderr);
    return events;
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) kill(); }
};
const check = (name: string, action: () => void) => { try { action(); } catch (error) { failures.push(`${name}: ${error}`); } };
try {
  const inspection = await run('config', ['app-server', '--listen', 'stdio://'], true);
  const effective = inspection.find(event => event.id === 2)?.result?.config;
  assert(effective, 'Missing actual native config/read result');
  const selected = effective.model_providers[effective.model_provider];
  check('actual contaminated fixture', () => {
    assert.equal(selected.base_url, `http://127.0.0.1:${port}/v1`);
    assert.equal(selected.experimental_bearer_token, 'synthetic-wrong-bearer');
    assert.equal(selected.query_params.hostile, 'inherited');
  });
  await run('rejected', ['exec', '--skip-git-repo-check', '--json', 'MUST_NOT_REACH_TRANSPORT'], false, 1);
  assert.equal(requests.length, 0, 'Conflicting native transport reached inference');
  assert.equal(readFileSync(join(home, 'config.toml'), 'utf8'), config);
  // The fixture owner removes the conflict to verify ordinary launches/resume. Wisp must not edit it.
  const clean = config.split('\n').filter(line => !/^(experimental_bearer_token|http_headers|env_http_headers|query_params)=/.test(line)).join('\n');
  writeFileSync(join(home, 'config.toml'), clean);
  check('native settings', () => {
    assert.equal(effective.model, 'wisp-transport-model'); assert.equal(effective.sandbox_mode, 'read-only');
    assert.equal(effective.approval_policy, 'never'); assert.equal(effective.web_search, 'disabled');
  });
  const first = await run('first', ['exec', '--skip-git-repo-check', '--json', 'FIRST_TRANSPORT_USER']);
  const next = await run('resume', ['exec', '--skip-git-repo-check', '--json', 'resume', '--last', 'NEXT_TRANSPORT_USER']);
  check('native resume', () => {
    const thread = first.find(event => event.type === 'thread.started')?.thread_id;
    assert(thread); assert.equal(next.find(event => event.type === 'thread.started')?.thread_id, thread);
    const history = JSON.stringify(requests.at(-1)?.body.input);
    assert(history.includes('FIRST_TRANSPORT_USER') && history.includes('NEXT_TRANSPORT_USER') && history.includes('TRANSPORT_OK'));
  });
  check('raw loopback requests', () => {
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.url, '/v1/responses'); assert.equal(request.headers.authorization, 'Bearer synthetic-bridge');
      assert.equal(request.headers['x-hostile'], undefined); assert.equal(request.body.model, 'wisp-transport-model');
    }
  });
  assert.equal(readFileSync(join(home, 'config.toml'), 'utf8'), clean);
  assert.equal(readFileSync(join(home, 'auth.json'), 'utf8'), auth);
} catch (error) { failures.push(String(error)); }
finally {
  for (const listener of [server, proxy]) { listener.closeAllConnections(); await new Promise<void>(yes => listener.close(() => yes())); }
  // Children have closed before removal; the fixture never points at a real native home.
  assert(resolve(home).startsWith(output + sep));
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  save('result.json', { version: version.stdout.trim(), failures, requests, blocked, pids: runs.map(run => run.pid), homeRemoved: !existsSync(home) });
}
console.log(JSON.stringify({ output, failures, requests: requests.length }));
assert.deepEqual(failures, [], 'Native transport isolation regression');
