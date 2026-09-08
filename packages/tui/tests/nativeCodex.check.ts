// Opt-in installed-CLI integration: bun packages/tui/tests/nativeCodex.check.ts [case ...]
// Requires codex-cli 0.153.4 and Node.js on PATH. Uses real launcher/Bridge, a deterministic
// local Chat Completions upstream, synthetic credentials and temporary homes. No live models.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { createConnection, type AddressInfo } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { createBridgeServer, type BridgeDeps } from '../../core/src/bridgeServer';
import { resolveCodex } from '../src/codex-wisp';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const runtime = `Bun ${process.versions.bun} (Node compatibility ${process.version})`;
const output = join(root, 'out', `codex-native-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(output, { recursive: true });
const save = (name: string, value: unknown) => writeFileSync(join(output, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const listen = (server: ReturnType<typeof createServer>): Promise<number> => new Promise(resolve =>
  server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
const close = async (server: ReturnType<typeof createServer>) => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
};
const frame = (res: ServerResponse, value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`);
const answer = (res: ServerResponse, text: string) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  frame(res, { choices: [{ delta: { content: text }, finish_reason: null }] });
  frame(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
  res.end('data: [DONE]\n\n');
};
const toolCall = (res: ServerResponse, name: string, args: unknown, index: number) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  frame(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: `native_call_${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] });
  frame(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
  res.end('data: [DONE]\n\n');
};
type Step = { tool: string; args: unknown };
type Case = { name: string; model?: string; steps: Step[]; followup?: boolean; dispatch?: boolean };
const cases: Case[] = [
  { name: 'default-text', steps: [], followup: true },
  { name: 'default-custom', steps: [{ tool: 'functions.exec (custom).', args: { input: 'text(await tools.get_goal({}));' } }] },
  { name: 'known-function', model: 'gpt-5.4', steps: [{ tool: 'get_goal (function).', args: {} }], dispatch: true },
  { name: 'unknown-text', model: 'wisp-native-unknown', steps: [] },
  { name: 'patch-rejection', model: 'gpt-5.4', steps: [{ tool: 'apply_patch (custom).', args: { input: '*** Begin Patch\n*** Add File: forbidden-native-patch.txt\n+MUST_NOT_WRITE\n*** End Patch\n' } }] },
  { name: 'discovery', model: 'gpt-5.4', steps: [
    { tool: 'tool_search (tool_search).', args: { query: 'close_agent close agent', limit: 1 } },
    { tool: 'multi_agent_v1.close_agent (function).', args: { target: '00000000-0000-0000-0000-000000000000' } },
  ] },
];
const requested = process.argv.slice(2);
assert(requested.every(name => cases.some(c => c.name === name)), 'Unknown case name');
const selected = cases.filter(c => requested.length === 0 || requested.includes(c.name));

// Only basic OS/runtime settings enter the isolated CLI. No provider/auth environment is copied.
const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(path|systemroot|windir|comspec|pathext|temp|tmp|lang|lc_all|term|appdata|localappdata)$/i.test(key)));
const installed = resolveCodex(env);
const version = spawnSync(installed.file, [...installed.args, '--version'], { env, encoding: 'utf8', windowsHide: true });
assert.equal(version.status, 0, version.stderr);
assert.equal(version.stdout.trim(), 'codex-cli 0.153.4', 'This retained contract is pinned to codex-cli 0.153.4');
const isolated = mkdtempSync(join(tmpdir(), 'wisp-native-%literal%-'));
save('environment.json', { version: version.stdout.trim(), platform: process.platform, arch: process.arch, runtime, installed, isolated });

let current: Case, seen: any[] = [], routeLog: string[] = [], serverErrors: string[] = [], proxyHits = 0, blockedExternalConnects = 0;
const proxyRequests: unknown[] = [];
const proxy = createServer((req, res) => { proxyHits++; proxyRequests.push({ method: req.method, url: req.url }); res.writeHead(502); res.end('External networking is disabled by this check.'); });
proxy.on('connect', (req, socket) => {
  if (/^(127\.0\.0\.1|localhost|\[::1\]):/.test(req.url ?? '')) proxyHits++;
  else blockedExternalConnects++;
  proxyRequests.push({ method: req.method, url: req.url }); socket.destroy();
});
const upstream = createServer(async (req, res) => {
  try {
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer synthetic-upstream');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    seen.push(body);
    save(`${current.name}-upstream.json`, seen);
    const step = current.steps[seen.length - 1];
    if (!step) return answer(res, `NATIVE_${current.name}_VISIBLE_FINAL`);
    const tool = body.tools.find((t: any) => t.function.description.startsWith(step.tool));
    assert(tool, `Missing native tool declaration: ${step.tool}`);
    toolCall(res, tool.function.name, step.args, seen.length);
  } catch (err) {
    serverErrors.push(String(err));
    res.writeHead(500); res.end(JSON.stringify({ error: { message: String(err) } }));
  }
});
const proxyPort = await listen(proxy);
const upstreamPort = await listen(upstream);
const spare = createServer(); const bridgePort = await listen(spare); await close(spare);
const provider = { id: 'native-fixture', label: 'Deterministic local fixture', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, defaultModel: 'fixture-backend', apiKeyEnv: '' };
const bridge = createBridgeServer({ providers: [provider], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => 'synthetic-upstream',
  clientFor: async () => new OpenAI({ apiKey: 'synthetic-upstream', baseURL: provider.baseUrl, maxRetries: 0 }),
  codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
  effort: () => 'medium', activeProviderId: () => provider.id, routingMap: () => ({ families: {}, aliases: [] }),
  aliasPickerShowsModel: () => false, aliasOnlyModels: () => false, port: () => bridgePort, accessSecret: () => 'synthetic-bridge',
  log: line => { routeLog.push(line); },
} satisfies BridgeDeps);

const run = async (args: string[], workspace: string, childEnv: NodeJS.ProcessEnv, dispatch = false) => {
  const entry = join(root, 'packages/tui/src', dispatch ? 'index.tsx' : 'codex-wisp.ts');
  const argv = [entry, ...(dispatch ? ['codex-wisp'] : []), ...args];
  const child = spawn(process.execPath, argv, { cwd: workspace, env: childEnv, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  child.stdout.on('data', data => stdout += data);
  child.stderr.on('data', data => stderr += data);
  const kill = () => {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* Already exited. */ } }
  };
  const timer = setTimeout(() => { timedOut = true; kill(); }, 45_000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    return { code, timedOut, stdout, stderr, argv, pid: child.pid };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) kill(); }
};
const reports: Record<string, unknown>[] = [];
try {
  await bridge.start();
  for (current of selected) {
    const started = Date.now();
    seen = []; routeLog = []; serverErrors = [];
    const folder = join(isolated, current.name), workspace = join(folder, 'workspace'), codexHome = join(folder, 'codex'), wispHome = join(folder, 'wisp');
    for (const dir of [workspace, codexHome, wispHome]) mkdirSync(dir, { recursive: true });
    const poison = `http://127.0.0.1:${proxyPort}/poison`;
    const config = `sandbox_mode="read-only"\napproval_policy="never"\nweb_search="live"\nmodel_provider="wisp_local"\n[model_providers.wisp_local]\nname="Hostile inherited table"\nbase_url="${poison}"\nwire_api="responses"\nenv_key="WRONG_TOKEN"\nrequires_openai_auth=true\nsupports_websockets=true\nexperimental_bearer_token="synthetic-wrong-bearer"\nhttp_headers={Authorization="Bearer synthetic-wrong-header"}\nenv_http_headers={"X-Hostile"="WRONG_TOKEN"}\nquery_params={hostile="inherited"}\n`;
    const auth = '{"OPENAI_API_KEY":"synthetic-native-auth"}\n';
    const wispConfig = JSON.stringify({ bridge: { port: bridgePort } });
    const wispAuth = JSON.stringify({ bridgeSecret: 'synthetic-bridge' });
    writeFileSync(join(codexHome, 'config.toml'), config); writeFileSync(join(codexHome, 'auth.json'), auth);
    writeFileSync(join(wispHome, 'config.json'), wispConfig); writeFileSync(join(wispHome, 'auth.json'), wispAuth);
    const childEnv = { ...env, HOME: folder, USERPROFILE: folder, CODEX_HOME: codexHome, WISP_HOME: wispHome,
      WISP_CODEX_BRIDGE_SECRET: 'synthetic-stale', WRONG_TOKEN: 'synthetic-wrong',
      HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
      http_proxy: `http://127.0.0.1:${proxyPort}`, https_proxy: `http://127.0.0.1:${proxyPort}`,
      ALL_PROXY: `http://127.0.0.1:${proxyPort}`, all_proxy: `http://127.0.0.1:${proxyPort}`, NO_PROXY: 'example.internal', no_proxy: 'example.internal',
    };
    const args = ['exec', '--skip-git-repo-check', '--json', '-C', workspace, ...(current.model ? ['-m', current.model] : []),
      'LOCAL_FIRST_USER: deterministic local integration check; follow the supplied tool call and final response.'];
    const result = await run(args, workspace, childEnv, current.dispatch);
    save(`${current.name}-stdout.txt`, result.stdout); save(`${current.name}-stderr.txt`, result.stderr);
    save(`${current.name}-command.json`, result.argv); save(`${current.name}-routes.json`, routeLog);
    let failure: string | undefined;
    try {
      assert.equal(result.timedOut, false, 'Native CLI timed out');
      assert.equal(result.code, 0, result.stderr);
      const events = result.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert(events.some(e => e.item?.type === 'agent_message' && e.item.text === `NATIVE_${current.name}_VISIBLE_FINAL`), 'Missing visible final answer');
      assert.equal(seen.length, current.steps.length + 1, 'Unexpected number of upstream turns');
      assert.deepEqual(serverErrors, []);
      assert.equal(proxyHits, 0, 'Proxy or inherited hostile endpoint received a request');
      assert(routeLog.some(line => line.includes(`'${current.model ?? 'gpt-6-astra'}' -> native-fixture`)), 'Native model selection did not survive the launcher');
      assert(seen.every(body => body.model === 'fixture-backend'), 'Active Provider model routing changed');
      assert(seen.every(body => body.tools.every((t: any) => !t.function.description.startsWith('web_search '))), 'Hosted search was declared');
      if (!current.model) assert(seen.every(body => body.parallel_tool_calls === false), 'Default model false parallelism lost');
      const results = seen.at(-1).messages.filter((m: any) => m.role === 'tool');
      assert.deepEqual(results.map((m: any) => m.tool_call_id), current.steps.map((_, i) => `native_call_${i + 1}`), 'Tool result identity/order changed');
      if (current.name === 'default-custom' || current.name === 'known-function') assert(results.some((m: any) => m.content.includes('"goal":null')), 'Native get_goal result missing');
      if (current.name === 'patch-rejection') {
        assert(results.some((m: any) => m.content.includes('blocked by read-only sandbox')), 'Patch policy rejection did not roundtrip');
        assert(!existsSync(join(workspace, 'forbidden-native-patch.txt')), 'Read-only patch unexpectedly wrote a file');
      }
      if (current.name === 'discovery') {
        assert(!seen[0].tools.some((t: any) => t.function.description.startsWith('multi_agent_v1.close_agent ')), 'Discovery was already eager');
        assert(seen[1].tools.some((t: any) => t.function.description.startsWith('multi_agent_v1.close_agent ')), 'Discovered-only definition missing');
        assert(results[0].content.includes('multi_agent_v1'), 'Structured discovery result lost');
        assert.equal(results[1]?.content, 'agent with id 00000000-0000-0000-0000-000000000000 not found', 'Namespaced native invocation did not return its missing-agent result');
      }
      if (current.followup) {
        const thread = events.find(e => e.type === 'thread.started')?.thread_id;
        assert(thread, 'Missing native thread id');
        const before = seen.length;
        const follow = await run(['exec', '--skip-git-repo-check', '--json', 'resume', thread, 'LOCAL_FOLLOWUP_USER: continue this same visible conversation.'], workspace, childEnv);
        save(`${current.name}-followup-stdout.txt`, follow.stdout); save(`${current.name}-followup-stderr.txt`, follow.stderr);
        assert.equal(follow.code, 0, follow.stderr);
        assert(follow.stdout.trim().split('\n').map(line => JSON.parse(line)).some(e => e.item?.type === 'agent_message' && e.item.text === `NATIVE_${current.name}_VISIBLE_FINAL`), 'Follow-up visible final answer missing');
        assert.equal(seen.length, before + 1);
        const history = JSON.stringify(seen.at(-1).messages);
        assert(history.includes('LOCAL_FIRST_USER') && history.includes('LOCAL_FOLLOWUP_USER') && history.includes(`NATIVE_${current.name}_VISIBLE_FINAL`), 'Visible history lost on follow-up');
      }
      assert.equal(readFileSync(join(codexHome, 'config.toml'), 'utf8'), config);
      assert.equal(readFileSync(join(codexHome, 'auth.json'), 'utf8'), auth);
      assert.equal(readFileSync(join(wispHome, 'config.json'), 'utf8'), wispConfig);
      assert.equal(readFileSync(join(wispHome, 'auth.json'), 'utf8'), wispAuth);
    } catch (err) { failure = String(err); }
    const report = { case: current.name, passed: !failure, seconds: Math.round((Date.now() - started) / 10) / 100, upstreamTurns: seen.length, childPid: result.pid, proxyHits, blockedExternalConnects, ...(failure ? { failure } : {}) };
    reports.push(report); save('summary.json', reports);
    save('proxy-requests.json', proxyRequests);
    console.log(JSON.stringify(report));
  }
} finally {
  bridge.stop(); await close(upstream); await close(proxy);
  rmSync(isolated, { recursive: true, force: true });
}
for (const port of [bridgePort, upstreamPort, proxyPort]) {
  const closed = await new Promise<boolean>(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); }); socket.once('error', () => resolve(true));
  });
  assert(closed, `Listener still open: ${port}`);
}
const passed = reports.every(r => r.passed);
save('REPORT.md', `# Native source launcher integration\n\nCLI: ${version.stdout.trim()}; host: ${process.platform}/${process.arch}; runtime: ${runtime}.\n\nReal source launcher, native Codex, real Bridge and deterministic keyed Chat Completions upstream. No live provider was tested. All homes were temporary; config/authentication bytes stayed unchanged on passing cases. Normal native session files were allowed.\n\n${reports.map(r => `- ${r.passed ? 'PASS' : 'FAIL'} ${r.case}: ${r.upstreamTurns} upstream requests, ${r.seconds}s${r.failure ? `; ${r.failure}` : ''}`).join('\n')}\n\nBridge/hostile endpoint requests through proxy: ${proxyHits}. Blocked external CONNECT attempts from native Codex background services: ${blockedExternalConnects}; see proxy-requests.json (no tunnels were opened). Listener sockets closed; temporary homes removed. The hostile inherited provider supplied a wrong URL, auth requirement, WebSocket capability, token, authorization headers, environment headers and query parameters. Successful authenticated local roundtrips prove the replacement transport overrides the hostile settings that would prevent them; extra non-auth headers/query absence is not captured at the Bridge socket.\n\nReproduce: \`bun packages/tui/tests/nativeCodex.check.ts\` (optional case names select a subset).\n`);
console.log(`Report: ${output}`);
process.exitCode = passed ? 0 : 1;
