import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(import.meta.dir, '../../..');
const entry = join(root, 'packages/tui/src/index.tsx');
let home: string;

beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'wisp-terminal-cli-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

const run = (args: string[]) => {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd: root, env: { ...process.env, WISP_HOME: home }, timeout: 10_000,
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
};

test('routing set recognizes Antigravity sign-in and still warns after sign-out', () => {
  writeFileSync(join(home, 'auth.json'), JSON.stringify({
    antigravity: { accessToken: 'fixture-token', projectId: 'example-project-1' },
  }));
  const args = [entry, 'routing', 'set', 'opus', 'antigravity/example-model'];
  expect(run(args)).toEqual({ code: 0, out: '', err: '' });
  expect(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).routing.families.opus)
    .toEqual({ providerId: 'antigravity', model: 'example-model' });

  writeFileSync(join(home, 'auth.json'), JSON.stringify({ antigravity: {} }));
  const signedOut = run(args);
  expect(signedOut.code).toBe(0);
  expect(signedOut.out).toContain("Provider 'antigravity' is not signed in");
});

test('the TUI Bridge persists its log once it starts, preserving the previous run', () => {
  writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port: 0 } }));
  writeFileSync(join(home, 'bridge.log'), 'previous run\n');
  const result = run(['--eval', `
    import { readFileSync } from 'fs';
    import { join } from 'path';
    import { createTuiBridge } from './packages/tui/src/bridge';
    const bridge = createTuiBridge(console.log);
    if (readFileSync(join(process.env.WISP_HOME, 'bridge.log'), 'utf8') !== 'previous run\\n')
      throw new Error('Constructing an idle Bridge rotated the active log');
    await bridge.start();
    bridge.stop();
  `]);
  expect(result.code).toBe(0);
  expect(result.err).toBe('');
  const log = readFileSync(join(home, 'bridge.log'), 'utf8');
  expect(log).toContain('[bridge] listening');
  expect(log).toContain('[bridge] stopped');
  expect(log.match(/\[bridge\] listening/g)?.length).toBe(1);
  expect(readFileSync(join(home, 'bridge.log.1'), 'utf8')).toBe('previous run\n');
});

test('a serve port collision leaves the active and previous logs intact', async () => {
  const listener = createServer();
  await new Promise<void>((resolve) => { listener.listen(0, '127.0.0.1', resolve); });
  try {
    const port = (listener.address() as { port: number }).port;
    writeFileSync(join(home, 'config.json'), JSON.stringify({ bridge: { port } }));
    writeFileSync(join(home, 'bridge.log'), 'active run\n');
    writeFileSync(join(home, 'bridge.log.1'), 'previous run\n');
    const result = run([entry, 'serve']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('already in use');
    expect(existsSync(join(home, 'bridge.log'))).toBe(true);
    expect(readFileSync(join(home, 'bridge.log'), 'utf8')).toBe('active run\n');
    expect(readFileSync(join(home, 'bridge.log.1'), 'utf8')).toBe('previous run\n');
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((err) => err ? reject(err) : resolve()));
  }
});

const waitFor = async (ready: () => boolean) => {
  const until = Date.now() + 3_000;
  while (!ready() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 25));
  expect(ready()).toBe(true);
};

const followAcrossRotation = async (replacement: string, gapMs = 0) => {
  const path = join(home, 'bridge.log');
  writeFileSync(path, 'before\n');
  const child = spawn(process.execPath, [entry, 'log', '-f'], {
    cwd: root, env: { ...process.env, WISP_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  try {
    await waitFor(() => out.includes('before\n') || child.exitCode !== null);
    expect(child.exitCode).toBe(null);
    renameSync(path, `${path}.1`);
    // Keep the rotation gap open for two 300ms polls, so a missing-file crash cannot hide between ticks.
    if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
    writeFileSync(path, replacement);
    await waitFor(() => out.includes(replacement) || child.exitCode !== null);
    expect(err).toBe('');
    expect(child.exitCode).toBe(null);
    expect(out).toContain(replacement);
    expect(out.match(/before\n/g)?.length).toBe(1);
  } finally {
    child.kill();
    await closed;
  }
};

test.each(['after!\n', 'after is longer\n'])('log -f reads a replacement file from the beginning: %s', async (replacement) => {
  await followAcrossRotation(replacement);
});

test('log -f survives the missing-file gap during rotation', async () => {
  await followAcrossRotation('after!\n', 650);
});

test.each([false, true])('log -f notices startup rotation without a later append (deferred: %s)', (deferred) => {
  writeFileSync(join(home, 'bridge.log'), 'before\n');
  const result = run(['--eval', `
    import { renameSync, writeFileSync } from 'fs';
    import { join } from 'path';
    import { runLogCli } from './packages/tui/src/bridgeLog';
    const path = join(process.env.WISP_HOME, 'bridge.log');
    const rotate = () => { renameSync(path, path + '.1'); writeFileSync(path, 'after!\\n'); };
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...args) => {
      const result = write(chunk, ...args);
      if (String(chunk) === 'before\\n') ${deferred ? 'queueMicrotask(rotate)' : 'rotate()'};
      return result;
    };
    runLogCli(['-f']);
    setTimeout(() => process.exit(0), 1000);
  `]);
  expect(result.code).toBe(0);
  expect(result.err).toBe('');
  expect(result.out).toContain('before\nafter!\n');
});
