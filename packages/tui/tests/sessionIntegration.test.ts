import { test, expect } from 'bun:test';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { listLogSessions, readSessionLog } from '@wisp/core';

const root = resolve(import.meta.dir, '../../..');
const until = async (ready: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  expect(ready()).toBe(true);
};

test('concurrent host processes respect retention and never share a conversation file', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wisp-session-writers-'));
  try {
    const results = await Promise.all([0, 1, 2].map(async worker => {
      const child = Bun.spawn([process.execPath, '--eval', `
        import { createSessionLogger } from './packages/core/src/sessionLog';
        const host = createSessionLogger('terminal-bridge');
        for (let i = 0; i < 60; i++) {
          const request = host.begin('messages', 'shared-external-identity-' + i);
          request.event('route', { model: 'worker-${worker}' }); request.finish('complete');
          await new Promise(resolve => setTimeout(resolve, 2));
        }
      `], { cwd: root, env: { ...process.env, WISP_HOME: home }, stdout: 'pipe', stderr: 'pipe' });
      return { code: await child.exited, stderr: await new Response(child.stderr).text() };
    }));
    expect(results).toEqual([{ code: 0, stderr: '' }, { code: 0, stderr: '' }, { code: 0, stderr: '' }]);
    const files = readdirSync(join(home, 'sessions')).filter(f => f.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThan(0); expect(files.length).toBeLessThanOrEqual(128);
    const seen = new Set<string>();
    for (const file of files) {
      const entries = readSessionLog(file.slice(0, 32), home);
      const models = new Set(entries.flatMap(e => e.model ? [e.model] : []));
      expect(models.size).toBeLessThanOrEqual(1);
      for (const model of models) seen.add(model);
    }
    expect(seen.size).toBe(3);
  } finally { rmSync(home, { recursive: true, force: true }); }
}, 20_000);

test('separate serve, CLI and fresh TUI processes see the same isolated chats', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wisp-session-integration-'));
  const upstream = createServer(async (req, res) => {
    for await (const _ of req) { /* consume fixture input */ }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"choices":[{"delta":{"content":"PRIVATE-REPLY"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as any).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const config = JSON.stringify({ provider: 'custom', customBaseUrl: `http://127.0.0.1:${(upstream.address() as any).port}/v1`, models: { custom: 'fixture-model' }, bridge: { port } });
  const auth = JSON.stringify({ bridgeSecret: 'fixture-bridge-secret', keys: { custom: 'fixture-upstream-secret' } });
  writeFileSync(join(home, 'config.json'), config); writeFileSync(join(home, 'auth.json'), auth);
  const env = { ...process.env, WISP_HOME: home };
  const child = spawn(process.execPath, [join(root, 'packages/tui/src/index.tsx'), 'serve'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  try {
    await until(() => out.includes('Ctrl+C to stop.') || child.exitCode !== null);
    expect(child.exitCode).toBe(null);
    const requests = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'].map(session_id =>
      fetch(`http://127.0.0.1:${port}/v1/messages`, { method: 'POST', headers: { 'x-api-key': 'fixture-bridge-secret' },
        body: JSON.stringify({ model: 'custom', max_tokens: 16, metadata: { user_id: JSON.stringify({ session_id }) },
          messages: [{ role: 'user', content: 'PRIVATE-PROMPT' }] }) }).then(async response => {
        expect(response.status).toBe(200); expect(await response.text()).toContain('PRIVATE-REPLY');
      }));
    await Promise.all(requests);
    const sessions = listLogSessions(home);
    expect(sessions).toHaveLength(2);
    for (const session of sessions) expect(readSessionLog(session.id, home).map(e => e.event)).toEqual(['request', 'route', 'complete']);
    const cli = Bun.spawnSync([process.execPath, join(root, 'packages/tui/src/index.tsx'), 'logs'], { cwd: root, env, timeout: 5000 });
    expect(cli.exitCode).toBe(0);
    for (const session of sessions) expect(cli.stdout.toString()).toContain(session.id);
    const selected = Bun.spawnSync([process.execPath, join(root, 'packages/tui/src/index.tsx'), 'log', sessions[0].id], { cwd: root, env, timeout: 5000 });
    expect(selected.exitCode).toBe(0); expect(selected.stdout.toString()).not.toContain(sessions[1].id);
    const ui = Bun.spawnSync([process.execPath, '--eval', `
      import assert from 'node:assert/strict';
      import { createElement, act } from 'react';
      import { testRender } from '@opentui/react/test-utils';
      globalThis.fetch = async () => { throw new Error('No network in reader UI'); };
      const { App } = await import('./src/app');
      const screen = await testRender(createElement(App), { width: 110, height: 38 });
      const keys = async (...keys) => { for (const key of keys) { await act(async () => screen.mockInput.pressKeys([key], key === 'ESCAPE' ? 50 : 0)); await screen.renderOnce(); } };
      try {
        await screen.renderOnce();
        await act(async () => screen.mockInput.typeText('/sh')); await keys('RETURN');
        assert(screen.captureCharFrame().includes('Chat sessions'), screen.captureCharFrame());
        await keys('ESCAPE');
        await act(async () => screen.mockInput.typeText('/show logs')); await keys('RETURN');
        const list = screen.captureCharFrame();
        assert(list.includes('${sessions[0].id}') && list.includes('${sessions[1].id}'), list);
        await keys('RETURN'); assert(screen.captureCharFrame().includes('Session log'));
        await keys('ESCAPE'); assert(screen.captureCharFrame().includes('Chat sessions'));
        await keys('ESCAPE'); assert(!screen.captureCharFrame().includes('Chat sessions'));
        await act(async () => screen.mockInput.typeText('/show-log')); await keys('RETURN');
        assert(screen.captureCharFrame().includes('Chat sessions'));
      } finally { await act(async () => screen.renderer.destroy()); }
    `], { cwd: join(root, 'packages/tui'), env, timeout: 8000 });
    expect(ui.stderr.toString()).toBe(''); expect(ui.exitCode).toBe(0);
    expect(out).not.toMatch(/PRIVATE|\[bridge\] (route|messages|error)/); expect(err).toBe('');
    expect(readFileSync(join(home, 'config.json'), 'utf8')).toBe(config);
    expect(readFileSync(join(home, 'auth.json'), 'utf8')).toBe(auth);
    const stored = readdirSync(join(home, 'sessions')).filter(f => f.endsWith('.jsonl')).map(f => readFileSync(join(home, 'sessions', f), 'utf8')).join('');
    expect(stored).not.toMatch(/PRIVATE|fixture-bridge-secret|fixture-upstream-secret/);
  } finally {
    child.kill(); await closed;
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  }
}, 20_000);
