// Opt-in installed-CLI integration: bun packages/tui/tests/nativeCodex.check.ts [case ...]
// Requires Bun >=1.4.2, codex-cli 0.153.4 and Node.js on PATH. Uses real launcher/Bridge, a deterministic
// local Chat Completions upstream, synthetic credentials and temporary homes. No live models.
// WISP_NATIVE_LAUNCH: JSON argv prefix for a compiled/npm launcher; WISP_NATIVE_PATH: its isolated PATH.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { createConnection, type AddressInfo } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { createBridgeServer, type BridgeDeps } from '../../core/src/bridgeServer';
import { resolveCodex } from '../src/codex-wisp';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const runtime = `Bun ${process.versions.bun} (Node compatibility ${process.version})`;
assert(Bun.semver.satisfies(process.versions.bun!, '>=1.4.2'), 'Native verification requires Bun >=1.4.2 (verified baseline): older Windows runtimes can leak inherited listener sockets.');
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
type Case = { name: string; model?: string; steps: Step[]; followup?: boolean; dispatch?: boolean; vision?: boolean; alias?: boolean; route?: boolean; liveEdit?: boolean; knownCaps?: boolean; effort?: string; rejected?: boolean };
const cases: Case[] = [
  { name: 'default-text', steps: [], followup: true },
  { name: 'vision-followup', steps: [], followup: true, vision: true },
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
cases.push(
  { name: 'alias-unknown', model: 'wisp-unknown-alias', alias: true, steps: [{tool:'get_goal (function).',args:{}}], followup:true },
  { name: 'alias-image-effort', model: 'wisp-image-alias', alias: true, knownCaps: true, vision: true, effort:'high', steps: [{tool:'get_goal (function).',args:{}}], followup:true },
  { name: 'alias-collision', model: 'gpt-6-astra', alias: true, steps: [{tool:'get_goal (function).',args:{}}] },
  { name: 'alias-effort-rejection', model: 'wisp-unknown-alias', alias: true, effort:'max', rejected:true, steps:[] },
  { name: 'route-one', model: 'gpt-5.6-sol', route: true, steps: [{tool:'get_goal (function).',args:{}}] },
  { name: 'route-two-image-effort', model: 'gpt-6-astra', route: true, knownCaps: true, vision: true, effort: 'high', followup: true, steps: [{tool:'get_goal (function).',args:{}}] },
  { name: 'route-live-edit', model: 'gpt-5.6-sol', route: true, liveEdit: true, steps: [{tool:'get_goal (function).',args:{}}] },
  { name: 'route-alias-collision', model: 'gpt-6-astra', route: true, alias: true, steps: [{tool:'get_goal (function).',args:{}}] },
  { name: 'route-effort-rejection', model: 'gpt-5.6-sol', route: true, effort:'max', rejected:true, steps:[] },
);
assert(requested.every(name => cases.some(c => c.name === name)), 'Unknown case name');
const selected = cases.filter(c => requested.length === 0 || requested.includes(c.name));
const packaged: string[] | undefined = process.env.WISP_NATIVE_LAUNCH ? JSON.parse(process.env.WISP_NATIVE_LAUNCH) : undefined;
assert(!packaged || (Array.isArray(packaged) && packaged.length > 0 && packaged.every(s => typeof s === 'string') && isAbsolute(packaged[0])), 'WISP_NATIVE_LAUNCH must be an argv array starting with an absolute executable');

// Only basic OS/runtime settings enter the isolated CLI. No provider/auth environment is copied.
const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(path|systemroot|windir|comspec|pathext|temp|tmp|lang|lc_all|term|appdata|localappdata)$/i.test(key)));
if (process.env.WISP_NATIVE_PATH !== undefined) {
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = process.env.WISP_NATIVE_PATH;
}
const installed = resolveCodex(env);
const version = spawnSync(installed.file, [...installed.args, '--version'], { env, encoding: 'utf8', windowsHide: true });
assert.equal(version.status, 0, version.stderr);
assert.equal(version.stdout.trim(), 'codex-cli 0.153.4', 'This retained contract is pinned to codex-cli 0.153.4');
const isolated = mkdtempSync(join(tmpdir(), 'wisp-native-%literal%-'));
save('environment.json', { version: version.stdout.trim(), platform: process.platform, arch: process.arch, runtime, installed, isolated, packaged, childPath: env.PATH ?? env.Path });

let current: Case, seen: any[] = [], routeLog: string[] = [], serverErrors: string[] = [], proxyHits = 0, blockedExternalConnects = 0;
let routingFile: string | undefined;
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
    if (current.liveEdit && seen.length === 1) {
      const config = JSON.parse(readFileSync(routingFile!, 'utf8'));
      config.routing.codexModels[current.model!].model = 'fixture-route-edited';
      writeFileSync(routingFile!, JSON.stringify(config));
    }
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
// The local Chat Completions fixture implements the advertised image/effort features. Known
// capabilities come from a synthetic Wisp account cache; no real Codex account is contacted.
const aliasProvider = () => current.knownCaps ? 'codex' : 'custom';
const routing = () => routingFile ? JSON.parse(readFileSync(routingFile, 'utf8')).routing : ({families:{},aliases:current.alias ? [{name:current.model!,target:{providerId:aliasProvider(),model:'fixture-alias-backend'}}] : [],
  ...(current.route ? { codexModels: { 'gpt-5.6-sol': { providerId: 'custom', model: 'fixture-route-one' }, 'gpt-6-astra': { providerId: 'codex', model: 'fixture-route-two' } } } : {}),
});
const pinnedModel = () => current.alias ? 'fixture-alias-backend' : current.route ? (current.model === 'gpt-6-astra' ? 'fixture-route-two' : 'fixture-route-one') : 'fixture-backend';
const bridge = createBridgeServer({ providers: [provider,{...provider,id:'custom'},{...provider,id:'codex'}], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => 'synthetic-upstream',
  clientFor: async () => new OpenAI({ apiKey: 'synthetic-upstream', baseURL: provider.baseUrl, maxRetries: 0 }),
  codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
  effort: () => 'medium', activeProviderId: () => provider.id, routingMap: routing,
  aliasPickerShowsModel: () => false, aliasOnlyModels: () => false, port: () => bridgePort, accessSecret: () => 'synthetic-bridge',
  log: line => { routeLog.push(line); },
} satisfies BridgeDeps);

const run = async (args: string[], workspace: string, childEnv: NodeJS.ProcessEnv, dispatch = false) => {
  const entry = join(root, 'packages/tui/src', dispatch ? 'index.tsx' : 'codex-wisp.ts');
  const command = packaged ?? [process.execPath, entry, ...(dispatch ? ['codex-wisp'] : [])];
  const argv = [...command.slice(1), ...args];
  const child = spawn(command[0], argv, { cwd: workspace, env: childEnv, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
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
    return { code, timedOut, stdout, stderr, argv: [command[0], ...argv], pid: child.pid };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) kill(); }
};
const reports: Record<string, unknown>[] = [];
const listModels = async (workspace: string, childEnv: NodeJS.ProcessEnv): Promise<any[]> => {
  const command = packaged ?? [process.execPath, join(root,'packages/tui/src/codex-wisp.ts')];
  // This protocol child needs only stdio, not a console shared with the test host.
  const child = spawn(command[0],[...command.slice(1),'app-server'],{cwd:workspace,env:childEnv,windowsHide:true,detached:true,stdio:['pipe','pipe','pipe']});
  let buffer = '', stderr = '', listed: any[] | undefined, requestedList = false;
  // Windows console descendants can retain inherited pipe ends after the launcher exits.
  // Once the requested response is complete and the process has exited, release our ends too.
  const closePipes = () => { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); };
  child.once('exit', closePipes);
  const send = (value: unknown) => child.stdin.write(JSON.stringify(value)+'\n');
  child.stderr.on('data',data => { stderr += data; save(`${current.name}-list-stderr.txt`,stderr); });
  child.stdout.on('data',data => {
    buffer += data;
    let newline: number;
    while ((newline=buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0,newline); buffer = buffer.slice(newline+1);
      if (!line) continue;
      const result = JSON.parse(line);
      if (result.id === 1 && !requestedList) {
        requestedList = true; send({method:'initialized',params:{}}); send({id:2,method:'model/list',params:{includeHidden:true}});
      }
      if (result.id === 2) { listed = result.result?.data; child.stdin.end(); }
    }
  });
  let rejectTimeout: (error: Error) => void;
  const deadline = new Promise<never>((_,reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => {
    if (process.platform === 'win32') spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    else { try { process.kill(-child.pid!,'SIGKILL'); } catch { /* Already exited. */ } }
    rejectTimeout(new Error(`model/list timed out: ${stderr}`));
  },15000);
  try {
    send({id:1,method:'initialize',params:{clientInfo:{name:'wisp-native-catalog-check',version:'0.0.0'},capabilities:{experimentalApi:true}}});
    await Promise.race([deadline,new Promise<void>((resolve,reject) => {child.once('error',reject);child.once('close',() => resolve());})]);
    save(`${current.name}-list-lifecycle.json`, { pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, closeObserved: true, pipesDestroyed: child.stdin.destroyed && child.stdout.destroyed && child.stderr.destroyed });
    assert.equal(child.exitCode,0,`model/list process failed: ${stderr}`);
    assert(listed,`model/list failed: ${stderr}`); return listed;
  } finally {clearTimeout(timer); closePipes();}
};
try {
  await bridge.start();
  for (current of selected) {
    const started = Date.now();
    seen = []; routeLog = []; serverErrors = [];
    routingFile = undefined;
    const folder = join(isolated, current.name), workspace = join(folder, 'workspace'), codexHome = join(folder, 'codex'), wispHome = join(folder, 'wisp');
    for (const dir of [workspace, codexHome, wispHome]) mkdirSync(dir, { recursive: true });
    const poison = `http://127.0.0.1:${proxyPort}/poison`;
    const config = `sandbox_mode="read-only"\napproval_policy="never"\nweb_search="live"\nmodel_provider="wisp_local"\n[model_providers.wisp_local]\nname="Hostile inherited table"\nbase_url="${poison}"\nwire_api="responses"\nenv_key="WRONG_TOKEN"\nrequires_openai_auth=true\nsupports_websockets=true\nexperimental_bearer_token="synthetic-wrong-bearer"\nhttp_headers={Authorization="Bearer synthetic-wrong-header"}\nenv_http_headers={"X-Hostile"="WRONG_TOKEN"}\nquery_params={hostile="inherited"}\n`;
    const auth = '{"OPENAI_API_KEY":"synthetic-native-auth"}\n';
    const wispConfig = JSON.stringify({ bridge: { port: bridgePort, aliasOnlyModels:true, aliasPickerShowsModel:true },routing:routing() });
    const wispAuth = JSON.stringify({ bridgeSecret: 'synthetic-bridge', ...(current.knownCaps ? {codex:{accessToken:'synthetic-metadata-only',accountId:'fixture-account'}} : {}) });
    if (current.knownCaps) {
      const scope = createHash('sha256').update('https://chatgpt.com/backend-api/codex\nfixture-account').digest('hex');
      mkdirSync(join(wispHome,'cache'));
      writeFileSync(join(wispHome,'cache',`codex-${scope}.json`),JSON.stringify({schema:1,fetchedAt:Date.now(),clientVersion:'0.153.4',models:[
        {id:pinnedModel(),name:'Fixture backend',visible:true,inputModalities:['text','image'],contextWindow:65536,reasoningEfforts:['high'],defaultEffort:'high'},
      ]}));
    }
    writeFileSync(join(codexHome, 'config.toml'), config); writeFileSync(join(codexHome, 'auth.json'), auth);
    writeFileSync(join(wispHome, 'config.json'), wispConfig); writeFileSync(join(wispHome, 'auth.json'), wispAuth);
    routingFile = join(wispHome, 'config.json');
    const childEnv = { ...env, HOME: folder, USERPROFILE: folder, CODEX_HOME: codexHome, WISP_HOME: wispHome,
      WISP_CODEX_BRIDGE_SECRET: 'synthetic-stale', WRONG_TOKEN: 'synthetic-wrong',
      HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
      http_proxy: `http://127.0.0.1:${proxyPort}`, https_proxy: `http://127.0.0.1:${proxyPort}`,
      ALL_PROXY: `http://127.0.0.1:${proxyPort}`, all_proxy: `http://127.0.0.1:${proxyPort}`, NO_PROXY: 'example.internal', no_proxy: 'example.internal',
    };
    const imagePath = join(workspace, 'fixture.png');
    if (current.vision) writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64'));
    const args = ['exec', '--skip-git-repo-check', '--json', '-C', workspace, ...(current.model ? ['-m', current.model] : []), ...(current.effort ? ['-c',`model_reasoning_effort="${current.effort}"`] : []), ...(current.vision ? ['--image', imagePath, '--'] : []),
      'LOCAL_FIRST_USER: deterministic local integration check; follow the supplied tool call and final response.'];
    const result = await run(args, workspace, childEnv, current.dispatch);
    save(`${current.name}-stdout.txt`, result.stdout); save(`${current.name}-stderr.txt`, result.stderr);
    save(`${current.name}-command.json`, result.argv); save(`${current.name}-routes.json`, routeLog);
    let failure: string | undefined;
    try {
      assert.equal(result.timedOut, false, 'Native CLI timed out');
      if (current.rejected) {
        assert.notEqual(result.code,0,'Unsupported effort unexpectedly succeeded');
        assert(result.stdout.includes('Unsupported reasoning effort'),'Missing effort rejection');
        assert.equal(seen.length,0,'Rejected effort reached upstream');
      } else {
      assert.equal(result.code, 0, result.stderr);
      const events = result.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert(events.some(e => e.item?.type === 'agent_message' && e.item.text === `NATIVE_${current.name}_VISIBLE_FINAL`), 'Missing visible final answer');
      assert.equal(seen.length, current.steps.length + 1, 'Unexpected number of upstream turns');
      assert.deepEqual(serverErrors, []);
      assert.equal(proxyHits, 0, 'Proxy or inherited hostile endpoint received a request');
      assert(routeLog.some(line => line.includes(`'${current.model ?? 'gpt-6-astra'}' -> ${current.alias || current.route ? aliasProvider() : 'native-fixture'}`)), 'Native model selection did not survive the launcher');
      assert(seen.every((body, index) => body.model === (current.liveEdit && index > 0 ? 'fixture-route-edited' : pinnedModel())), 'Pinned/Active Provider model routing changed');
      if (current.route && !current.alias) assert(routeLog.some(line => line.includes('route codex-model')), 'Wrong match category');
      if (current.alias || current.route) assert(seen.every(body => body.reasoning_effort === (current.knownCaps ? 'high' : undefined)), 'Target effort metadata does not match the upstream request');
      if (current.vision) assert(seen[0].messages.some((m: any) => m.role === 'user' && Array.isArray(m.content) && m.content.some((p: any) => p.type === 'image_url' && p.image_url.url.startsWith('data:image/png;base64,'))), 'Native attached image lost');
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
        const follow = await run(['exec', '--skip-git-repo-check', '--json', 'resume', thread, ...(current.model ? ['-m',current.model] : []), 'LOCAL_FOLLOWUP_USER: continue this same visible conversation.'], workspace, childEnv);
        save(`${current.name}-followup-stdout.txt`, follow.stdout); save(`${current.name}-followup-stderr.txt`, follow.stderr);
        assert.equal(follow.code, 0, follow.stderr);
        assert(follow.stdout.trim().split('\n').map(line => JSON.parse(line)).some(e => e.item?.type === 'agent_message' && e.item.text === `NATIVE_${current.name}_VISIBLE_FINAL`), 'Follow-up visible final answer missing');
        assert.equal(seen.length, before + 1);
        const history = JSON.stringify(seen.at(-1).messages);
        assert(history.includes('LOCAL_FIRST_USER') && history.includes('LOCAL_FOLLOWUP_USER') && history.includes(`NATIVE_${current.name}_VISIBLE_FINAL`), 'Visible history lost on follow-up');
        if (current.vision) assert(history.includes('data:image/png;base64,'), 'Native image lost on resumed turn');
      }
      }
      if ((current.alias || current.route) && !current.rejected) {
        const models = await listModels(workspace,childEnv);
        save(`${current.name}-model-list.json`,models);
        assert(models.some(m => m.id === 'gpt-5.6-sol'),'Native choices disappeared');
        const aliases = models.filter(m => m.id === current.model);
        assert.equal(aliases.length,1,'Alias missing or collision duplicated');
        assert(aliases[0].description.includes(current.liveEdit ? 'fixture-route-edited' : pinnedModel()),'Pinned Target description missing after relaunch');
        assert.deepEqual(aliases[0].supportedReasoningEfforts.map((e:any) => e.reasoningEffort),current.knownCaps ? ['high'] : []);
        assert.deepEqual(aliases[0].inputModalities,current.knownCaps ? ['text','image'] : ['text']);
        assert.deepEqual(aliases[0].serviceTiers,[]);
      }
      assert.equal(readFileSync(join(codexHome, 'config.toml'), 'utf8'), config);
      assert.equal(readFileSync(join(codexHome, 'auth.json'), 'utf8'), auth);
      const expectedConfig = JSON.parse(wispConfig);
      if (current.liveEdit) expectedConfig.routing.codexModels[current.model!].model = 'fixture-route-edited';
      assert.equal(readFileSync(join(wispHome, 'config.json'), 'utf8'), JSON.stringify(expectedConfig));
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
// Bridge.stop() initiates an asynchronous server.close(). Verify the listener actually closes
// within a bounded drain period, including error responses with native keep-alive connections.
for (const port of [bridgePort, upstreamPort, proxyPort]) {
  const started = Date.now();
  let closed = false;
  do {
    closed = await new Promise<boolean>(resolve => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(250,() => {socket.destroy();resolve(false);});
      socket.once('connect', () => { socket.destroy(); resolve(false); }); socket.once('error', () => resolve(true));
    });
    if (!closed) await new Promise(resolve => setTimeout(resolve,50));
  } while (!closed && Date.now()-started < 2000);
  console.log(JSON.stringify({listener:port,closed,drainMs:Date.now()-started}));
  assert(closed, `Listener still open: ${port}`);
  // Check from a separate Node runtime as well: Bun's server.close event is not TCP evidence.
  const external = spawnSync('node',['-e',`const s=require('node:net').connect(Number(process.argv[1]),'127.0.0.1');s.setTimeout(1000);s.on('connect',()=>{s.destroy();process.exitCode=1;});s.on('timeout',()=>{s.destroy();process.exitCode=1;});s.on('error',e=>{console.log(e.code);process.exitCode=e.code==='ECONNREFUSED'?0:1;});`,String(port)],{encoding:'utf8',windowsHide:true,timeout:2000});
  assert.equal(external.status,0,`External TCP probe failed for ${port}: ${external.stderr}`);
  assert.equal(external.stdout.trim(),'ECONNREFUSED',`External TCP listener still open: ${port}`);
}
const passed = reports.every(r => r.passed);
save('REPORT.md', `# Native launcher integration\n\nCLI: ${version.stdout.trim()}; host: ${process.platform}/${process.arch}; runtime: ${runtime}.\n\n${packaged ? 'Packaged launcher (' + JSON.stringify(packaged) + ')' : 'Source launcher'}, native Codex, source-hosted Bridge and deterministic keyed Chat Completions upstream. No live provider was tested. All homes were temporary; config/authentication bytes stayed unchanged on passing cases. Normal native session files were allowed.\n\n${reports.map(r => `- ${r.passed ? 'PASS' : 'FAIL'} ${r.case}: ${r.upstreamTurns} upstream requests, ${r.seconds}s${r.failure ? `; ${r.failure}` : ''}`).join('\n')}\n\nBridge/hostile endpoint requests through proxy: ${proxyHits}. Blocked external CONNECT attempts from native Codex background services: ${blockedExternalConnects}; see proxy-requests.json (no tunnels were opened). Listener sockets closed; temporary homes removed. The hostile inherited provider supplied a wrong URL, auth requirement, WebSocket capability, token, authorization headers, environment headers and query parameters. Successful authenticated local roundtrips prove the replacement transport overrides the hostile settings that would prevent them; extra non-auth headers/query absence is not captured at the Bridge socket.\n\nReproduce: \`bun packages/tui/tests/nativeCodex.check.ts\` (optional case names select a subset). For packaged runs set WISP_NATIVE_LAUNCH (JSON argv prefix) and WISP_NATIVE_PATH as recorded in environment.json.\n`);
console.log(`Report: ${output}`);
process.exitCode = passed ? 0 : 1;
