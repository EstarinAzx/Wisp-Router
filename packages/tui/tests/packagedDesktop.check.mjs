// node packages/tui/tests/packagedDesktop.check.mjs <compiled-wisp>
// Runs the copied binary and npm dispatcher outside the source tree, with temporary homes only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = mkdtempSync(join(tmpdir(), 'wisp packaged desktop ')); const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binary = join(folder, process.platform === 'win32' ? 'wisp.exe' : 'wisp'); const pkg = join(folder, 'package');
const server = createServer((req, res) => { assert.equal(req.headers['x-api-key'], 'synthetic-local'); assert.equal(req.url, '/codex-desktop/status'); res.setHeader('content-type', 'application/json'); res.end('{"protocol":1}'); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
try {
  cpSync(resolve(process.argv[2]), binary); cpSync(join(root, 'packages/tui/npm/wisp-router'), pkg, { recursive: true });
  const platform = join(pkg, 'node_modules/@tsd47216', `wisp-router-${process.platform}-${process.arch}`, 'bin'); mkdirSync(platform, { recursive: true }); cpSync(binary, join(platform, process.platform === 'win32' ? 'wisp.exe' : 'wisp'));
  let index = 0;
  for (const command of [[binary], [process.execPath, join(pkg, 'bin/wisp.js')]]) {
    const codex = join(folder, `codex-${index}`); const wisp = join(folder, `wisp-${index++}`); mkdirSync(codex); mkdirSync(wisp);
    writeFileSync(join(codex, 'config.toml'), 'model="preserved-default"\n'); writeFileSync(join(codex, 'auth.json'), 'unchanged-native-auth');
    writeFileSync(join(wisp, 'auth.json'), '{"bridgeSecret":"synthetic-local"}'); writeFileSync(join(wisp, 'config.json'), JSON.stringify({ bridge: { port: server.address().port }, routing: { families: {}, aliases: [] } }));
    const run = args => new Promise((yes, no) => {
      const child = spawn(command[0], [...command.slice(1), 'codex-desktop', ...args], { cwd: folder, windowsHide: true, env: { ...process.env, CODEX_HOME: codex, WISP_HOME: wisp } }); let out = '', err = '';
      child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c); child.on('error', no);
      const timer = setTimeout(() => { child.kill(); no(new Error('packaged command timeout')); }, 20000);
      child.on('close', code => { clearTimeout(timer); try { assert.equal(code, 0, err); assert(!out.includes('synthetic-local')); yes(out); } catch (e) { no(e); } });
    });
    assert((await run(['--help'])).includes('Restart Codex'));
    assert.equal(JSON.parse(await run(['status', '--json'])).enabled, false);
    assert.equal(JSON.parse(await run(['enable', '--json'])).enabled, true);
    assert(readFileSync(join(codex, 'config.toml'), 'utf8').includes('requires_openai_auth = true'));
    assert.equal(JSON.parse(await run(['refresh', '--json'])).enabled, true);
    assert.equal(JSON.parse(await run(['status', '--json'])).bridge, true);
    assert.equal(JSON.parse(await run(['disable', '--json'])).enabled, false);
    assert.equal(readFileSync(join(codex, 'config.toml'), 'utf8'), 'model="preserved-default"\n'); assert.equal(readFileSync(join(codex, 'auth.json'), 'utf8'), 'unchanged-native-auth');
  }
  console.log('PASS compiled and npm desktop lifecycle outside source cwd');
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); rmSync(folder, { recursive: true, force: true }); }
