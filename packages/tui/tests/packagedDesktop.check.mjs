// node packagedDesktop.check.mjs <compiled-wisp> <extracted npm shell or -> <expected version>
// Hermetic packaging check on every native runner; actual-client evidence is nativeDesktop.check.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

assert(process.argv[2], 'Supply a compiled binary');
const folder = mkdtempSync(join(tmpdir(), 'wisp packaged desktop '));
const binaryName = process.platform === 'win32' ? 'wisp.exe' : 'wisp'; const binary = join(folder, binaryName);
const runtime = join(folder, 'fixture-runtime'); const exporter = join(runtime, 'node_modules/@openai/codex/bin');
mkdirSync(exporter, { recursive: true });
// Keep a relocated copy only as a diagnostic control: macOS Node may load adjacent libraries.
const relocatedNode = join(folder, process.platform === 'win32' ? 'relocated-node.exe' : 'relocated-node'); cpSync(process.execPath, relocatedNode);
const exportLog = join(folder, 'exports.jsonl');
writeFileSync(join(exporter, 'codex.js'), `const fs=require('fs'), assert=require('assert/strict');
assert.deepEqual(process.argv.slice(2),['debug','models','--bundled']);
assert(process.env.CODEX_HOME); assert.equal(fs.existsSync(require('path').join(process.env.CODEX_HOME,'auth.json')),false);
fs.appendFileSync(${JSON.stringify(exportLog)},JSON.stringify({args:process.argv.slice(2),runtime:process.execPath})+'\\n');
console.log(JSON.stringify({models:[{slug:'fixture-native',display_name:'Fixture native',visibility:'list',packaging_fixture:true}]}));`);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|temp|tmp)$/i.test(key)));
// The fixture shim wins discovery; Node stays in its original installation directory.
Object.assign(env, { PATH: [runtime, dirname(process.execPath)].join(delimiter), HOME: folder, USERPROFILE: folder });
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const stop = async child => { if (child && child.exitCode === null && child.signalCode === null) { const closed = new Promise(r => child.once('close', r)); child.kill(); await closed; } };
const captures = [];
const upstream = createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c; captures.push({ headers: req.headers, body: JSON.parse(body) });
  res.setHeader('content-type', 'text/event-stream'); res.end('data: {"choices":[{"delta":{"content":"PACKAGED_DESKTOP_OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
});
const upstreamPort = await listen(upstream); let bridge;
try {
  const probeHome = join(folder, 'export-preflight'); mkdirSync(probeHome);
  const probe = executable => {
    const result = spawnSync(executable, [join(exporter, 'codex.js'), 'debug', 'models', '--bundled'], { cwd: folder, env: { ...env, CODEX_HOME: probeHome }, encoding: 'utf8', timeout: 10000, windowsHide: true });
    return { executable, status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
  };
  const relocated = probe(relocatedNode), installed = probe(process.execPath);
  const libraries = process.platform === 'darwin' ? spawnSync('/usr/bin/otool', ['-L', process.execPath], { encoding: 'utf8', timeout: 10000, windowsHide: true }) : undefined;
  console.log(`Catalog fixture preflight: ${JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, relocated, installed,
    ...(libraries ? { linkedLibraries: { status: libraries.status, error: libraries.error?.message, stdout: libraries.stdout, stderr: libraries.stderr } } : {}) })}`);
  assert.equal(installed.status, 0, `Installed Node fixture export failed: ${installed.error ?? installed.stderr}`);
  assert.equal(JSON.parse(installed.stdout).models[0].slug, 'fixture-native');
  writeFileSync(exportLog, ''); // The assertions below count only production-triggered exports.
  cpSync(resolve(process.argv[2]), binary); const commands = [[binary]];
  let manifest;
  if (process.argv[3] && process.argv[3] !== '-') {
    const pkg = join(folder, 'package'); cpSync(resolve(process.argv[3]), pkg, { recursive: true });
    manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
    assert(Object.values(manifest.optionalDependencies).every(v => v === manifest.version));
    const platform = join(pkg, 'node_modules/@tsd47216', `wisp-router-${process.platform}-${process.arch}`);
    assert.equal(JSON.parse(readFileSync(join(platform, 'package.json'), 'utf8')).version, manifest.version);
    assert.equal(hash(join(platform, 'bin', binaryName)), hash(binary), 'Packed platform bytes differ from standalone');
    commands.push([process.execPath, join(pkg, manifest.bin.wisp)]);
  }
  const expected = process.argv[4] ?? manifest?.version; assert(expected, 'Supply expected version or an extracted npm shell');
  if (manifest) assert.equal(manifest.version, expected);
  let index = 0;
  for (const command of commands) {
    const codex = join(folder, `codex-${index}`); const wisp = join(folder, `wisp-${index++}`); mkdirSync(codex); mkdirSync(wisp);
    const childEnv = { ...env, CODEX_HOME: codex, WISP_HOME: wisp };
    const run = args => new Promise((yes, no) => {
      const child = spawn(command[0], [...command.slice(1), ...args], { cwd: folder, windowsHide: true, env: childEnv }); let out = '', err = '';
      child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c); child.on('error', no);
      const timer = setTimeout(() => { child.kill(); no(new Error('packaged command timeout')); }, 20000);
      child.on('close', code => { clearTimeout(timer); try { assert.equal(code, 0, err); assert(!out.includes('synthetic-local')); yes(out); } catch (e) { no(e); } });
    });
    assert.equal(await run(['--version']), `wisp-router ${expected}\n`); assert.deepEqual(readdirSync(wisp), []); assert.deepEqual(readdirSync(codex), []);
    const spare = createServer(); const port = await listen(spare); await new Promise(r => spare.close(r));
    writeFileSync(join(codex, 'config.toml'), 'model="preserved-default"\n'); writeFileSync(join(codex, 'auth.json'), 'unchanged-native-auth');
    writeFileSync(join(wisp, 'auth.json'), '{"bridgeSecret":"synthetic-local","keys":{"custom":"synthetic-external"}}');
    writeFileSync(join(wisp, 'config.json'), JSON.stringify({ bridge: { port }, customBaseUrl: `http://127.0.0.1:${upstreamPort}/v1`, routing: { families: {}, aliases: [{ name: 'packaged-alias', target: { providerId: 'custom', model: 'EXACT_PACKAGED_TARGET' } }] } }));
    bridge = spawn(binary, ['serve'], { cwd: folder, windowsHide: true, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }); bridge.stdout.resume(); bridge.stderr.resume();
    let alive = false;
    for (let attempt = 0; attempt < 60; attempt++) { try { const res = await fetch(`http://127.0.0.1:${port}/codex-desktop/status`, { headers: { 'x-api-key': 'synthetic-local' }, signal: AbortSignal.timeout(500) }); assert.equal((await res.json()).protocol, 1); alive = true; break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    assert(alive, 'Compiled signed Bridge failed to start');
    const desktop = args => run(['codex-desktop', ...args]);
    assert((await desktop(['--help'])).includes('Restart Codex'));
    assert.equal(JSON.parse(await desktop(['status', '--json'])).enabled, false);
    assert.equal(JSON.parse(await desktop(['enable', '--json'])).enabled, true);
    const config = readFileSync(join(codex, 'config.toml'), 'utf8'); assert(config.includes('requires_openai_auth = true')); assert(config.includes('supports_websockets = false'));
    const catalog = JSON.parse(readFileSync(join(wisp, 'codex-desktop/models.json'), 'utf8')); assert.deepEqual(catalog.models.map(m => m.slug), ['fixture-native', 'packaged-alias']);
    assert.equal(catalog.models[0].packaging_fixture, true);
    const response = await fetch(`http://127.0.0.1:${port}/codex-desktop/v1/responses`, { method: 'POST', headers: { 'x-api-key': 'synthetic-local', authorization: 'Bearer synthetic-native', 'chatgpt-account-id': 'synthetic-account', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'packaged-alias', input: 'local packaging check', stream: false }) });
    assert.equal(response.status, 200); assert((await response.text()).includes('PACKAGED_DESKTOP_OK'));
    const capture = captures.at(-1); assert.equal(capture.body.model, 'EXACT_PACKAGED_TARGET'); assert.equal(capture.headers.authorization, 'Bearer synthetic-external'); assert(!capture.headers['chatgpt-account-id']); assert(!capture.headers['x-api-key']);
    assert.equal(JSON.parse(await desktop(['refresh', '--json'])).enabled, true);
    assert.equal(JSON.parse(await desktop(['status', '--json'])).bridge, true);
    assert.equal(JSON.parse(await desktop(['disable', '--json'])).enabled, false);
    assert.equal(readFileSync(join(codex, 'config.toml'), 'utf8'), 'model="preserved-default"\n'); assert.equal(readFileSync(join(codex, 'auth.json'), 'utf8'), 'unchanged-native-auth');
    await stop(bridge); bridge = undefined;
  }
  const exports = readFileSync(exportLog, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(exports.length, commands.length * 2);
  assert(exports.every(entry => realpathSync(entry.runtime) === realpathSync(process.execPath)), 'Catalog fixture must use the installed Node runtime in place');
  console.log(`PASS ${process.platform}/${process.arch}: version ${expected}, copied compiled${manifest ? ' and packed npm' : ''} desktop lifecycle, production signed route and credential separation. Isolated catalog fixture; no installed Codex/Bun or source runtime.`);
} finally { await stop(bridge); upstream.closeAllConnections(); await new Promise(r => upstream.close(r)); rmSync(folder, { recursive: true, force: true }); }
