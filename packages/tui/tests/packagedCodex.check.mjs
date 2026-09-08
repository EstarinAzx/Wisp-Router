// node packages/tui/tests/packagedCodex.check.mjs <compiled binary> [extracted npm shell]
// Run on each native release runner. Optional npm input must be stamped and unpacked from npm pack.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

assert(process.argv[2], 'Supply a compiled binary');
const folder = mkdtempSync(join(tmpdir(), 'wisp-packaged-%literal%-'));
const binaryName = process.platform === 'win32' ? 'wisp.exe' : 'wisp';
const binary = join(folder, binaryName);
const home = join(folder, 'home');
mkdirSync(home);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|temp|tmp)$/i.test(key)));
Object.assign(env, { PATH: '', HOME: home, USERPROFILE: home, WISP_HOME: home });
const run = (command, args = []) => {
  const result = spawnSync(command[0], [...command.slice(1), ...args], { cwd: folder, env, encoding: 'utf8', timeout: 15_000, windowsHide: true });
  assert.ifError(result.error);
  return result;
};
const failedLaunch = (command, message) => {
  const result = run(command);
  assert.equal(result.status, 1, result.stderr);
  assert(result.stderr.includes(message), result.stderr);
};
let server;
try {
  cpSync(resolve(process.argv[2]), binary);
  const commands = [[binary, 'codex-wisp'], [binary, 'claude-wisp']];
  let pkg, manifest;
  if (process.argv[3]) {
    pkg = join(folder, 'package');
    cpSync(resolve(process.argv[3]), pkg, { recursive: true });
    manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert(Object.values(manifest.optionalDependencies).every(v => v === manifest.version), 'Platform version pins differ');
    for (const name of ['wisp', 'claude-wisp', 'codex-wisp']) {
      assert.equal(typeof manifest.bin[name], 'string', `Missing npm command ${name}`);
      assert(existsSync(join(pkg, manifest.bin[name])), `Missing npm shim ${name}`);
    }
    const platform = join(pkg, 'node_modules', '@tsd47216', `wisp-router-${process.platform}-${process.arch}`);
    assert.equal(JSON.parse(readFileSync(join(platform, 'package.json'), 'utf8')).version, manifest.version);
    commands.push([process.execPath, join(pkg, manifest.bin['codex-wisp'])], [process.execPath, join(pkg, manifest.bin['claude-wisp'])]);
    const routing = run([process.execPath, join(pkg, manifest.bin.wisp)], ['routing', '--json']);
    assert.equal(routing.status, 0, routing.stderr);
    JSON.parse(routing.stdout);
  }
  for (const command of commands) failedLaunch(command, 'No Bridge secret');
  assert(!existsSync(join(home, 'auth.json')), 'A launcher created authentication');
  assert(!existsSync(join(home, 'config.json')), 'A launcher created configuration');
  const spare = createServer();
  await new Promise(resolve => spare.listen(0, '127.0.0.1', resolve));
  const port = spare.address().port;
  await new Promise(resolve => spare.close(resolve));
  const config = JSON.stringify({ bridge: { port } });
  const auth = JSON.stringify({ bridgeSecret: 'synthetic-packaged-secret' });
  writeFileSync(join(home, 'config.json'), config);
  writeFileSync(join(home, 'auth.json'), auth);
  for (const command of commands) failedLaunch(command, 'Bridge not reachable');
  const routing = run([binary], ['routing', '--json']);
  assert.equal(routing.status, 0, routing.stderr);
  JSON.parse(routing.stdout);
  // Exercise the same versioned cache fallback, without a network download.
  if (pkg) {
    rmSync(join(pkg, 'node_modules'), { recursive: true, force: true });
    const cache = join(home, '.wisp', 'bin', `v${manifest.version}`);
    mkdirSync(cache, { recursive: true });
    cpSync(binary, join(cache, binaryName));
    failedLaunch([process.execPath, join(pkg, manifest.bin['codex-wisp'])], 'Bridge not reachable');
  }
  // Boot the compiled core too: an authenticated invalid Responses envelope reaches its translator.
  server = spawn(binary, ['serve'], { cwd: folder, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  server.stderr.on('data', data => errors += data);
  server.stdout.resume();
  server.on('error', err => errors += String(err));
  let response;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { response = await fetch(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(500) }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert(response, `Compiled Bridge did not start: ${errors}`);
  assert.equal(response.status, 401);
  response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-packaged-secret', 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000),
  });
  assert.equal(response.status, 400, await response.text());
  assert.equal(readFileSync(join(home, 'config.json'), 'utf8'), config);
  assert.equal(readFileSync(join(home, 'auth.json'), 'utf8'), auth);
  console.log(`PASS ${process.platform}/${process.arch}: compiled dispatch, no-secret/down-Bridge failures, existing launchers, Responses route, unchanged stores${pkg ? ', packed npm optional dependency and versioned cache' : ''}. Child PATH empty; no source or Bun runtime required.`);
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const closed = new Promise(resolve => server.once('close', resolve));
    server.kill();
    await closed;
  }
  rmSync(folder, { recursive: true, force: true });
}
