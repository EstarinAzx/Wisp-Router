// Runtime regression: bun packages/tui/tests/socketInheritance.check.mjs
// Bun 1.3.14 on Windows lets a child retain unrelated HTTP listener handles.
// Keep the child alive across server.close; a separate Node process must get ECONNREFUSED.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';

const server = createServer((req, res) => res.end('ok'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const child = spawn('node', ['-e', 'process.stdin.resume();process.stdin.on("end",()=>process.exit(0));console.log("ready");'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const exited = once(child, 'close');
const timer = setTimeout(() => child.kill(), 5000);
let result;
try {
  await once(child.stdout, 'data');
  await new Promise(resolve => server.close(resolve));
  result = spawnSync('node', ['-e', `const s=require('node:net').connect(Number(process.argv[1]),'127.0.0.1');s.setTimeout(1000);s.on('connect',()=>{console.log('CONNECTED');s.destroy();});s.on('timeout',()=>{console.log('TIMEOUT');s.destroy();});s.on('error',e=>console.log(e.code));`, String(port)], { encoding: 'utf8', windowsHide: true, timeout: 2000 });
  assert.equal(child.exitCode, null, 'Child must still be alive during the socket probe');
} finally {
  child.stdin.end();
  await exited;
  clearTimeout(timer);
  server.close();
}
console.log(JSON.stringify({ runtime: process.versions.bun ?? process.version, port, probe: result.stdout.trim(), childExit: child.exitCode }));
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout.trim(), 'ECONNREFUSED', 'Child inherited a listener that the parent closed');
assert.equal(child.exitCode, 0);
