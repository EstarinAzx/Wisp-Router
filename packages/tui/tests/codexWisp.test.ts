import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import { tmpdir } from 'os';
import { delimiter, join, resolve } from 'path';

import * as launcher from '../src/codex-wisp';
import { catalogArguments, mergeAliasCatalog, parseNativeCatalog, readNativeCatalog, writeChildCatalog } from '../src/codexCatalog';
const root = resolve(import.meta.dir, '../../..');
const source = join(root, 'packages/tui/src/codex-wisp.ts');
const dispatch = join(root, 'packages/tui/src/index.tsx');
let home: string;
const servers: Server[] = [];
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'wisp codex %PATH% ')); });
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
  rmSync(home, { recursive: true, force: true });
});
const listen = async (handler: Parameters<typeof createServer>[0]) => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
};

test('launcher is import-safe and exposes its launch builder', () => {
  expect(typeof launcher.buildCodexLaunch).toBe('function');
  expect(typeof launcher.runCodexWisp).toBe('function');
});

test('child overlay preserves native selection, arguments and parent environment', () => {
  const env = { CODEX_HOME: 'untouched', OPENAI_API_KEY: 'native', WISP_CODEX_BRIDGE_SECRET: 'stale', NO_PROXY: 'internal', no_proxy: 'other' };
  const args = ['exec', '-m', 'a-known-model', '-c', 'sandbox_mode="read-only"', 'spaces "quotes" & | < > ^ %PATH%', '--', '--search'];
  const launch = launcher.buildCodexLaunch(12345, 'synthetic-secret', args, env);
  expect(launch.args.slice(-args.length)).toEqual(args);
  expect(launch.args.join(' ')).not.toContain('synthetic-secret');
  const config = Object.fromEntries(launch.args.slice(0, -args.length).filter((_, i) => i % 2).map(value => {
    const split = value.indexOf('=');
    return [value.slice(0, split), Bun.TOML.parse(`value=${value.slice(split + 1)}`).value];
  }));
  expect(config).toEqual({
    model_provider: 'wisp_local',
    'model_providers.wisp_local': {
      name: 'Wisp local Responses bridge', base_url: 'http://127.0.0.1:12345/v1', wire_api: 'responses',
      env_key: 'WISP_CODEX_BRIDGE_SECRET', requires_openai_auth: false, supports_websockets: false,
    },
    web_search: 'disabled',
  });
  expect(launcher.buildCodexLaunch(12345, 'key', [], {}).args.join(' ')).not.toMatch(/(?:^|\s)model=/);
  expect(launch.env).toEqual({ ...env, WISP_CODEX_BRIDGE_SECRET: 'synthetic-secret', NO_PROXY: 'internal,127.0.0.1,localhost,::1', no_proxy: 'other,127.0.0.1,localhost,::1' });
  expect(env.WISP_CODEX_BRIDGE_SECRET).toBe('stale');
});

const forbidden = [
  ['--profile', 'test'], ['-ptest'], ['-p=test'], ['--profile=test'],
  ['--oss'], ['--local-provider=ollama'],
  ['--remote', 'wss://elsewhere.invalid'], ['--remote-auth-token-env=WISP_CODEX_BRIDGE_SECRET'],
  ['-c', 'model_provider="elsewhere"'], ['-cmodel_providers={ x = {} }'],
  ['--config=model_providers.wisp_local.base_url="https://elsewhere.invalid"'],
  ['-c=model_providers.wisp_local.http_headers={Authorization="oops"}'],
  ['--config', 'profiles.test.model_provider="elsewhere"'], ['-c', 'profile="test"'],
  ['--search'], ['--search=true'], ['--enable', 'web_search_request'], ['--enable=web_search_cached'],
  ['-c', 'web_search="live"'], ['-c', 'web_search=cached'], ['-c', 'tools.web_search=true'],
  ['-c', 'features.web_search_request=true'], ['-c', 'features={web_search_cached=true}'],
  ['-c', 'tools={web_search=true}'], ['-c', 'features={"web_search_request"=true}'],
];
test.each(forbidden.map(args => [args]))('rejects provider/profile/search override before and after subcommands: %j', (args) => {
  for (const prefix of [[], ['exec'], ['exec', 'resume']]) {
    expect(() => launcher.buildCodexLaunch(12345, 'key', [...prefix, ...args], {})).toThrow(/codex-wisp/);
  }
});

test('retains unrelated config, disabled search and option-looking prompt text', () => {
  const args = ['exec', '-c', 'model="selected"', '--config', 'features={tool_search=true,web_search_request=false}',
    '-c', 'web_search="disabled"', '--disable', 'web_search_cached', '-c', 'tools.web_search=false',
    '--', '--profile', '--search', '-cmodel_provider=anything'];
  expect(launcher.buildCodexLaunch(12345, 'key', args, {}).args.slice(-args.length)).toEqual(args);
});

test.skipIf(process.platform !== 'win32')('Windows credential casing cannot preserve a stale child token', () => {
  const launch = launcher.buildCodexLaunch(12345, 'fresh', [], { wisp_codex_bridge_secret: 'stale' });
  expect(Object.entries(launch.env).filter(([key]) => key.toUpperCase() === 'WISP_CODEX_BRIDGE_SECRET'))
    .toEqual([['WISP_CODEX_BRIDGE_SECRET', 'fresh']]);
});

test.each([0, -1, 65536, 1.5, NaN])('rejects invalid loopback port %s', port => {
  expect(() => launcher.buildCodexLaunch(port, 'key', [], {})).toThrow(/port/);
});

test('probe is credential-free, never follows redirects and accepts an auth challenge', async () => {
  let redirected = 0;
  const destination = await listen((_req, res) => { redirected++; res.end(); });
  const observed: any[] = [];
  const port = await listen((req, res) => {
    observed.push({ url: req.url, headers: req.headers });
    res.writeHead(observed.length === 1 ? 302 : 401, { location: `http://127.0.0.1:${destination}/steal` });
    res.end();
  });
  expect(await launcher.probeCodexBridge(port)).toBe(true);
  expect(await launcher.probeCodexBridge(port)).toBe(true);
  expect(redirected).toBe(0);
  expect(observed.map(request => request.url)).toEqual(['/v1/models', '/v1/models']);
  expect(observed.every(request => !request.headers.authorization && !request.headers.cookie)).toBe(true);
});

const run = async (entry: string[], args: string[], env: Record<string, string | undefined>) => {
  const inherited = { ...process.env };
  // Windows treats Path/PATH as one variable. Avoid duplicate keys in Bun's spawn block.
  if (process.platform === 'win32' && env.PATH !== undefined) {
    for (const key of Object.keys(inherited)) if (key.toLowerCase() === 'path') delete inherited[key];
  }
  const child = Bun.spawn([process.execPath, ...entry, ...args], {
    cwd: root, env: { ...inherited, WISP_HOME: home, CODEX_HOME: join(home, 'codex-home'), ...env },
    stdout: 'pipe', stderr: 'pipe', stdin: 'ignore',
  });
  const timeout = setTimeout(() => child.kill(), 10_000);
  try {
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, out, err };
  } finally { clearTimeout(timeout); }
};

test.each([[[source]], [[dispatch, 'codex-wisp']]])('source entry %j runs direct npm JS with literal argv and preserves stores', async (entry) => {
  const captures: any[] = [];
  const port = await listen((req, res) => { captures.push(req.headers); res.writeHead(401); res.end(); });
  let proxyHits = 0;
  const proxy = await listen((_req, res) => { proxyHits++; res.end(); });
  const config = JSON.stringify({ bridge: { port, aliasOnlyModels: true }, routing: { families: {}, aliases: [
    { name: 'my-alias', target: { providerId: 'custom', model: 'unknown-backend' } },
    { name: 'native-visible', target: { providerId: 'custom', model: 'collision-backend' } },
  ] } });
  const auth = JSON.stringify({ bridgeSecret: 'synthetic-only' });
  writeFileSync(join(home, 'config.json'), config);
  writeFileSync(join(home, 'auth.json'), auth);
  const bin = join(home, 'node_modules', '@openai', 'codex', 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'codex.js'), `
    const fs = require('fs'); const args = process.argv.slice(2);
    if (args.includes('debug')) {
      console.log(JSON.stringify({models: [
        {slug:'native-visible',display_name:'Native',visibility:'list',supported_in_api:true,unknown_future_field:{preserve:true}},
        {slug:'native-hidden',display_name:'Hidden',visibility:'hide',supported_in_api:false,unknown_future_field:{preserve:true}}
      ]})); process.exit(0);
    }
    const override = args.find(a => a.startsWith('model_catalog_json='));
    const path = override && JSON.parse(override.slice('model_catalog_json='.length));
    console.log(JSON.stringify({args, catalogPath:path, catalog:path && JSON.parse(fs.readFileSync(path,'utf8')), token:process.env.WISP_CODEX_BRIDGE_SECRET, bypass:process.env.NO_PROXY, lower:process.env.no_proxy, home:process.env.CODEX_HOME})); process.exit(23);`);
  // A shell shim would corrupt %PATH%; the launcher must bypass it completely.
  writeFileSync(join(home, 'codex.cmd'), '@echo BROKEN_SHIM\r\nexit /b 99\r\n');
  const args = ['exec', '-m', 'unchanged', ' spaces "quoted" & | < > ^ %PATH% ', '--', '--search'];
  const result = await run(entry, args, {
    PATH: home + delimiter + process.env.PATH, WISP_CODEX_BRIDGE_SECRET: 'stale', NO_PROXY: 'internal', no_proxy: 'other',
    HTTP_PROXY: `http://127.0.0.1:${proxy}`, HTTPS_PROXY: `http://127.0.0.1:${proxy}`,
    http_proxy: `http://127.0.0.1:${proxy}`, https_proxy: `http://127.0.0.1:${proxy}`,
  });
  expect(result, result.err).toMatchObject({ code: 23 });
  const received = JSON.parse(result.out);
  expect(received.catalog?.models.map((m: any) => m.slug)).toEqual(['native-visible', 'native-hidden', 'my-alias']);
  expect(received.catalog.models[0]).toMatchObject({ description: expect.stringContaining('Custom'), supported_reasoning_levels: [], input_modalities: ['text'], context_window: null });
  expect(received.catalog.models[1]).toEqual({slug:'native-hidden',display_name:'Hidden',visibility:'hide',supported_in_api:false,unknown_future_field:{preserve:true}});
  expect(received.catalog.models[2].description).not.toContain('unknown-backend');
  expect(existsSync(received.catalogPath)).toBe(false);
  expect(received.args.slice(-args.length)).toEqual(args);
  expect(received.token).toBe('synthetic-only');
  expect(received.bypass).toBe('internal,127.0.0.1,localhost,::1');
  expect(received.lower).toBe(process.platform === 'win32' ? received.bypass : 'other,127.0.0.1,localhost,::1');
  expect(received.home).toBe(join(home, 'codex-home'));
  expect(result.err).not.toContain('synthetic-only');
  expect(result.err).toContain('Hosted web search');
  expect(proxyHits).toBe(0);
  expect(captures.length).toBe(1);
  expect(captures[0].authorization).toBeUndefined();
  expect(readFileSync(join(home, 'config.json'), 'utf8')).toBe(config);
  expect(readFileSync(join(home, 'auth.json'), 'utf8')).toBe(auth);
  expect(existsSync(join(home, 'codex-home'))).toBe(false);
});

test('missing secret fails clearly without creating a Wisp store', async () => {
  const result = await run([source], [], {});
  expect(result.code).toBe(1);
  expect(result.err).toContain('No Bridge secret');
  expect(result.err).toContain('wisp serve');
  expect(readdirSync(home)).toEqual([]);
});

test('unreachable Bridge fails before resolving or starting Codex', async () => {
  const port = await listen((_req, res) => res.end());
  await new Promise<void>(resolve => servers.pop()!.close(() => resolve()));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port } }));
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-only' }));
  const result = await run([source], [], { PATH: home });
  expect(result.code).toBe(1);
  expect(result.err).toContain('Bridge not reachable');
  expect(result.err).not.toContain('synthetic-only');
});

test('unresponsive Bridge probe has an absolute deadline', async () => {
  const port = await listen((_req, _res) => {});
  expect(await launcher.probeCodexBridge(port)).toBe(false);
}, 4000);

test('rejected options never probe or spawn, including after a subcommand', async () => {
  let hits = 0;
  const port = await listen((_req, res) => { hits++; res.end(); });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port } }));
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-only' }));
  const result = await run([source], ['exec', '-c', 'model_providers.wisp_local.env_key="synthetic-only"'], {});
  expect(result.code).toBe(1);
  expect(result.err).toContain('provider overrides');
  expect(result.err).not.toContain('synthetic-only');
  expect(hits).toBe(0);
});

test('missing executable and shell-only installation produce actionable errors', () => {
  expect(() => launcher.resolveCodex({ PATH: home })).toThrow(/Could not find Codex/);
  writeFileSync(join(home, 'codex.cmd'), '@exit /b 99');
  expect(() => launcher.resolveCodex({ PATH: home })).toThrow(/Shell-only shims/);
  const bin = join(home, 'node_modules', '@openai', 'codex', 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'codex.js'), '');
  expect(() => launcher.resolveCodex({ PATH: home })).toThrow(/Node.js/);
});

test('native executable takes precedence over a sibling npm shim', () => {
  const file = join(home, process.platform === 'win32' ? 'codex.exe' : 'codex');
  writeFileSync(file, '');
  expect(launcher.resolveCodex({ PATH: `"${home}"` })).toEqual({ file, args: [] });
});

test('spawn failure exits cleanly without leaking a credential', async () => {
  const port = await listen((_req, res) => res.end());
  writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port } }));
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-only' }));
  writeFileSync(join(home, process.platform === 'win32' ? 'codex.exe' : 'codex'), 'invalid executable');
  const result = await run([source], [], { PATH: home });
  expect(result.code).toBe(1);
  expect(result.err).toContain('Could not export the Codex catalog');
  expect(result.err).not.toContain('synthetic-only');
});

test('invalid credential cannot leak through a synchronous spawn error', async () => {
  const port = await listen((_req, res) => res.end());
  writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port } }));
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-only\u0000token' }));
  writeFileSync(join(home, process.platform === 'win32' ? 'codex.exe' : 'codex'), 'invalid executable');
  const result = await run([source], [], { PATH: home });
  expect(result.code).toBe(1);
  expect(result.err).not.toContain('synthetic-only');
});

test('termination handler forwards to the child and preserves signal exit status', async () => {
  const port = await listen((_req, res) => res.end());
  writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port } }));
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-only' }));
  const bin = join(home, 'node_modules', '@openai', 'codex', 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'codex.js'), `if(process.argv.includes('debug')) { console.log(JSON.stringify({models:[]})); process.exit(0); } require('fs').writeFileSync(require('path').join(process.env.WISP_HOME,'ready'),String(process.pid)); setInterval(() => {},1000);`);
  const result = await run(['--eval', `
    import { existsSync } from 'fs';
    import { join } from 'path';
    import { runCodexWisp } from './packages/tui/src/codex-wisp';
    const timer = setInterval(() => {
      if (existsSync(join(process.env.WISP_HOME,'ready'))) {
        clearInterval(timer); process.emit('SIGTERM');
      }
    }, 20);
    process.exitCode = await runCodexWisp([]);
    console.log('listeners=' + process.listenerCount('SIGTERM'));
  `], [], { PATH: home + delimiter + process.env.PATH });
  expect(result.code).toBe(143);
  if (process.platform === 'win32') expect(result.out).toContain('listeners=0');
  const pid = Number(readFileSync(join(home, 'ready'), 'utf8'));
  expect(() => process.kill(pid, 0)).toThrow();
});

test('catalog arguments preserve ordinary options, honor source overrides and follow the native working directory', () => {
  const args = ['--cd', home, 'exec', '--config=model_catalog_json="first.json"', '-cmodel_catalog_json="last.json"', '-c', 'sandbox_mode="read-only"', '--', '-cmodel_catalog_json="prompt"'];
  expect(catalogArguments(args)).toEqual({
    config: ['-c', 'model_catalog_json="first.json"', '-c', 'model_catalog_json="last.json"', '-c', 'sandbox_mode="read-only"'],
    child: ['-c', 'sandbox_mode="read-only"', '--cd', home, 'exec', '--', '-cmodel_catalog_json="prompt"'], explicit: true, cwd: home,
  });
  for (const arg of [`-C=${home}`, `-C${home}`, `--cd=${home}`]) {
    expect(catalogArguments(['exec',arg]).cwd).toBe(home);
    expect(catalogArguments(['exec',arg]).child).toEqual(['exec',arg]);
  }
});

test('catalog validation rejects malformed envelopes and duplicate ids without reducing hidden descriptors', () => {
  for (const value of [null, [], {}, {models:[{}]}, {models:[{slug:''}]}, {models:[{slug:'x'},{slug:'x'}]}]) {
    expect(() => parseNativeCatalog(value)).toThrow();
  }
  const native = {models:[{slug:'private',visibility:'hide',supported_in_api:false,future:{field:42}}]};
  expect(parseNativeCatalog(native)).toEqual(native);
});

test('aliases use pinned capabilities, label preferences and one collision row without modifying the native catalog', () => {
  const native = { models: [{slug:'image-alias', visibility:'hide', arbitrary:'native-profile'}, {slug:'old-model',visibility:'hide'}] };
  const config = { routing: {families:{}, aliases:[{name:'image-alias', target:{providerId:'custom',model:'fixture'}}]}, bridge:{aliasPickerShowsModel:true} };
  const merged = mergeAliasCatalog(native, config, () => ({vision:true,contextInput:12345,efforts:['high'],defaultEffort:'high'}));
  expect(merged.models).toHaveLength(2);
  expect(merged.models[0]).toMatchObject({slug:'image-alias',description:expect.stringContaining('fixture'),input_modalities:['text','image'],context_window:12345,supported_reasoning_levels:[{effort:'high',description:'high reasoning'}],default_reasoning_level:'high',service_tiers:[],supports_image_detail_original:false});
  expect(native.models[0]).toEqual({slug:'image-alias', visibility:'hide', arbitrary:'native-profile'});
  expect(merged.models[1]).toEqual(native.models[1]);
  expect(() => mergeAliasCatalog(native, {...config,routing:{families:{},aliases:[{name:'bad',target:{providerId:'missing',model:'x'}}]}}, () => undefined)).toThrow();
});

test('per-child catalogs are UTF-8 without BOM and remain isolated until cleanup', () => {
  const a = writeChildCatalog({models:[{slug:'日本語'}]}), b = writeChildCatalog({models:[{slug:'other'}]});
  try {
    expect(a.path).not.toBe(b.path);
    expect(readFileSync(a.path).subarray(0,3)).not.toEqual(Buffer.from([0xef,0xbb,0xbf]));
    expect(JSON.parse(readFileSync(a.path,'utf8')).models[0].slug).toBe('日本語');
    a.cleanup(); expect(existsSync(a.path)).toBe(false); expect(existsSync(b.path)).toBe(true);
  } finally { a.cleanup(); b.cleanup(); }
});

test('catalog export uses the resolved executable, source catalog and bounded bundled fallback', async () => {
  const script = join(home, 'fake codex.ts');
  writeFileSync(script, `
    const args = process.argv.slice(2);
    if (args.includes('--bundled')) console.log(JSON.stringify({models:[{slug:'bundled'}]}));
    else if (args.includes('model_catalog_json="input.json"')) console.log(JSON.stringify({models:[{slug:'supplied'}]}));
    else setInterval(() => {}, 1000);
  `);
  const codex = {file:process.execPath,args:[script]};
  expect((await readNativeCatalog(codex,['-c','model_catalog_json="input.json"'],process.env,1000)).models[0].slug).toBe('supplied');
  expect((await readNativeCatalog(codex,[],process.env,150)).models[0].slug).toBe('bundled');
  await expect(readNativeCatalog(codex,['-c','model_catalog_json="missing.json"'],process.env,150)).rejects.toThrow(/catalog/);
  writeFileSync(script, `console.log(JSON.stringify({models:[{slug:'duplicate'},{slug:'duplicate'}]}));`);
  await expect(readNativeCatalog(codex,[],process.env,1000)).rejects.toThrow(/unique/);
});

test('a timed-out npm export also terminates the native executable descendant', async () => {
  const script = join(home,'export-tree.ts'), pidFile = join(home,'descendant.pid');
  writeFileSync(script, `
    import {spawn} from 'child_process'; import {writeFileSync} from 'fs';
    if (process.argv.includes('--bundled')) { console.log(JSON.stringify({models:[]})); process.exit(0); }
    if (process.argv.includes('--descendant')) { writeFileSync(${JSON.stringify(pidFile)},String(process.pid)); }
    else spawn(process.execPath,[${JSON.stringify(script)},'--descendant'],{stdio:'ignore',windowsHide:true});
    setInterval(() => {}, 1000);
  `);
  let pid: number | undefined;
  try {
    await readNativeCatalog({file:process.execPath,args:[script]},[],process.env,500);
    pid = Number(readFileSync(pidFile,'utf8'));
    expect(() => process.kill(pid!,0)).toThrow();
  } finally {
    pid ??= existsSync(pidFile) ? Number(readFileSync(pidFile,'utf8')) : undefined;
    if (pid) try { process.kill(pid); } catch { /* Already terminated by the exporter. */ }
  }
});
