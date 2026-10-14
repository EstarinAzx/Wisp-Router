import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(import.meta.dir, '../../..');
const entry = join(root, 'packages/tui/src/index.tsx');
let home: string;

beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'wisp-terminal-cli-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

const run = (args: string[], cwd = root, timeout = 10_000) => {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd, env: { ...process.env, WISP_HOME: home }, timeout,
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
};

test('version reports the bundled package without renderer or home writes', () => {
  const version = JSON.parse(readFileSync(join(root, 'packages/tui/package.json'), 'utf8').replace(/^\uFEFF/, '')).version;
  const result = Bun.spawnSync([process.execPath, entry, '--version'], { cwd: home, env: { ...process.env, WISP_HOME: home, CODEX_HOME: home }, timeout: 1000 });
  expect(result.exitCode).toBe(0); expect(result.stdout.toString()).toBe(`wisp-router ${version}\n`); expect(result.stderr.toString()).toBe('');
  expect(readdirSync(home)).toEqual([]);
});

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

test('antigravity-compat explicitly toggles only the client fallback setting', () => {
  const compat = (...args: string[]) => run([entry, 'antigravity-compat', ...args], root, 1000);
  const config = { future: 'keep', bridge: { port: 4242, aliasOnlyModels: false, future: 'keep' },
    routing: { families: {}, aliases: [] } };
  const file = join(home, 'config.json');
  writeFileSync(file, JSON.stringify(config));
  const before = readFileSync(file, 'utf8');
  const status = compat('status');
  expect(status.code).toBe(0);
  expect(status.out).toContain('off');
  expect(compat('on', 'unexpected').code).toBe(1);
  expect(compat('invalid').code).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe(before);
  for (const [mode, enabled] of [['on', true], ['off', false]] as const) {
    const result = compat(mode);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain(mode);
    if (enabled) { expect(result.out).toContain('user context'); expect(result.out).toContain('omitted'); }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ...config, bridge: { ...config.bridge, antigravityClientFallback: enabled } });
  }
  expect(existsSync(join(home, 'auth.json'))).toBe(false);
});

test.each([[40, 24], [100, 32]])('TUI compatibility guidance and errors remain reachable at %sx%s', (width, height) => {
  const config = { future: 'keep', bridge: { port: 4242, aliasOnlyModels: false } };
  writeFileSync(join(home, 'config.json'), JSON.stringify(config));
  const result = run(['--eval', `
    import assert from 'node:assert/strict';
    import { createElement, act } from 'react';
    import { testRender } from '@opentui/react/test-utils';
    import { readFileSync, readdirSync, writeFileSync } from 'fs';
    import { join } from 'path';
    globalThis.fetch = async () => { throw new Error('No networking in compatibility checks'); };
    const { App } = await import('./src/app');
    const ui = await testRender(createElement(App), { width: ${width}, height: ${height} });
    const frame = () => ui.captureCharFrame().replace(/[│╭╮╰╯─█]/g, ' ').replace(/\\s+/g, ' ');
    const file = join(process.env.WISP_HOME, 'config.json');
    const before = readFileSync(file, 'utf8');
    const key = async (name) => { await act(async () => ui.mockInput.pressKeys([name], name === 'ESCAPE' ? 50 : 0)); await ui.renderOnce(); };
    const command = async (text) => { await act(async () => ui.mockInput.typeText(text)); await key('RETURN'); };
    try {
      await ui.renderOnce();
      await command('/antigravity-compat');
      assert(frame().includes('Antigravity client fallback: off'), ui.captureCharFrame());
      assert.equal(readFileSync(file, 'utf8'), before);
      await key('ESCAPE');
      assert(!ui.captureCharFrame().includes('Cancelled.'));
      await command('/antigravity-compat on');
      assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { ...JSON.parse(before), bridge: { ...JSON.parse(before).bridge, antigravityClientFallback: true } });
      let frames = frame();
      for (let i = 0; i < 30; i++) { await key('ARROW_DOWN'); frames += frame(); }
      for (const copy of ['some feature-specific', 'reminders may be omitted.', 'Start a new Claude', 'behavior is unchanged.', 'Esc closes']) assert(frames.includes(copy), copy + '\\n' + frames);
      await key('ESCAPE');
      const enabled = readFileSync(file, 'utf8');
      await command('/antigravity-compat on off');
      assert(ui.captureCharFrame().includes('Usage:'), ui.captureCharFrame());
      assert.equal(readFileSync(file, 'utf8'), enabled);
      await key('ESCAPE');
      writeFileSync(file, '{broken json');
      await command('/antigravity-compat off');
      assert(ui.captureCharFrame().includes('Could not update'), ui.captureCharFrame());
      assert.equal(readFileSync(file, 'utf8'), '{broken json');
      await key('ESCAPE');
      assert(!ui.captureCharFrame().includes('Cancelled.'));
      assert.deepEqual(readdirSync(process.env.WISP_HOME), ['config.json']);
    } finally { await act(async () => ui.renderer.destroy()); }
  `], join(root, 'packages/tui'));
  expect(result.err).toBe('');
  expect(result.code).toBe(0);
});

test('Codex CLI writes preserve aliases, snapshots and unknown fields, without requiring discovery', () => {
  const config = { future: 'keep', routing: { families: {}, aliases: [
    { name: 'codex', target: { providerId: 'custom', model: 'legacy' } },
  ] }, snapshots: { codex: { providerId: 'custom', model: 'old' } } };
  writeFileSync(join(home, 'config.json'), JSON.stringify(config));
  for (const [name, model] of [['future-mini', 'mini'], ['future-spark', 'spark']]) {
    expect(run([entry, 'routing', 'codex', 'set', name, `custom/${model}`]).code).toBe(0);
  }
  expect(run([entry, 'routing', 'set', 'sol', 'custom/alias']).code).toBe(0);
  expect(run([entry, 'routing', 'unset', 'codex']).code).toBe(0);
  const saved = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
  expect(saved.future).toBe('keep');
  expect(saved.snapshots).toEqual(config.snapshots);
  expect(saved.routing.codexModels).toEqual({ 'future-mini': { providerId: 'custom', model: 'mini' }, 'future-spark': { providerId: 'custom', model: 'spark' } });
  expect(run([entry, 'routing', 'codex', 'unset', 'future-mini']).code).toBe(0);
  const before = readFileSync(join(home, 'config.json'), 'utf8');
  expect(run([entry, 'routing', 'codex', 'set', 'future-mini', 'missing/model']).code).toBe(1);
  expect(readFileSync(join(home, 'config.json'), 'utf8')).toBe(before);
  const listed = run(['--eval', `process.env.PATH = ''; process.env.Path = ''; const { runRoutingCli } = await import('./packages/tui/src/routingCli'); await runRoutingCli(['codex']);`]);
  expect(listed.code).toBe(0);
  expect(listed.out).toContain('Could not find Codex');
  expect(listed.out).toContain('future-spark');
  expect(listed.out).toContain('custom/spark');
});

test('TUI Codex saved rows remain editable and clear/Esc return to Codex', () => {
  writeFileSync(join(home, 'config.json'), JSON.stringify({ routing: { families: {}, aliases: [], codexModels: { 'saved:missing': { providerId: 'custom', model: 'saved' } } } }));
  const result = run(['--eval', `
    import assert from 'node:assert/strict';
    import { createElement, act } from 'react';
    import { testRender } from '@opentui/react/test-utils';
    import { readFileSync } from 'fs';
    import { join } from 'path';
    process.env.PATH = ''; process.env.Path = '';
    globalThis.fetch = async () => { throw new Error('No networking in TUI navigation checks'); };
    const { App } = await import('./src/app');
    const ui = await testRender(createElement(App), { width: 100, height: 40 });
    const keys = async (...keys) => { for (const key of keys) { await act(async () => ui.mockInput.pressKeys([key], key === 'ESCAPE' ? 50 : 0)); await ui.renderOnce(); } };
    try {
      await ui.renderOnce();
      await act(async () => ui.mockInput.typeText('/routing')); await keys('RETURN');
      assert(ui.captureCharFrame().includes('Claude Code'), ui.captureCharFrame());
      assert(ui.captureCharFrame().includes('Codex'));
      assert(ui.captureCharFrame().includes('Custom'));
      await keys('ARROW_DOWN', 'RETURN');
      await act(async () => { await new Promise(r => setTimeout(r, 30)); }); await ui.renderOnce();
      assert(ui.captureCharFrame().includes('saved:missing'));
      await keys('RETURN');
      await keys('ESCAPE');
      assert(ui.captureCharFrame().includes('saved:missing'));
      await keys('RETURN');
      assert(ui.captureCharFrame().includes('via...'), ui.captureCharFrame());
      await keys('ARROW_UP', 'ARROW_UP', 'RETURN'); // Custom is the last Provider, before Clear.
      await act(async () => { await new Promise(r => setTimeout(r, 30)); }); await ui.renderOnce();
      assert(ui.captureCharFrame().includes('type an id'), ui.captureCharFrame());
      await act(async () => ui.mockInput.typeText('edited-model')); await keys('RETURN');
      assert(ui.captureCharFrame().includes('saved:missing'), ui.captureCharFrame());
      assert.equal(JSON.parse(readFileSync(join(process.env.WISP_HOME, 'config.json'), 'utf8')).routing.codexModels['saved:missing'].model, 'edited-model');
      await keys('RETURN');
      await keys('ARROW_UP');
      assert(ui.captureCharFrame().includes('Clear route'), ui.captureCharFrame());
      await keys('RETURN');
      assert(ui.captureCharFrame().includes('route cleared'), ui.captureCharFrame());
      assert(!JSON.parse(readFileSync(join(process.env.WISP_HOME, 'config.json'), 'utf8')).routing.codexModels['saved:missing']);
      await keys('ARROW_DOWN', 'RETURN'); // Empty discovery must be safe to navigate.
      await keys('ESCAPE');
      assert(ui.captureCharFrame().includes('Claude Code'));
    } finally { await act(async () => ui.renderer.destroy()); }
  `], join(root, 'packages/tui'));
  expect(result.err).toBe('');
  expect(result.code).toBe(0);
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
