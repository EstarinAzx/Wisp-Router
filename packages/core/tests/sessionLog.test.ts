import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as logs from '../src/index';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'wisp-sessions-')); });
afterEach(() => { vi.useRealTimers(); rmSync(home, { recursive: true, force: true }); });

it('exports a shared logger usable by every host', () => {
  expect(logs.createSessionLogger).toBeTypeOf('function');
});

it('keeps lifecycle events in a labeled host stream outside the chat list', () => {
  const host = logs.createSessionLogger('terminal-bridge', home);
  const id = host.lifecycle('start'); host.lifecycle('stop');
  expect(logs.listLogSessions(home)).toEqual([]);
  expect(logs.listLogSessions(home, true).map(s => s.protocol)).toEqual(['host']);
  expect(logs.readSessionLog(id, home).map(e => e.event)).toEqual(['start', 'stop']);
});

it('keeps interleaved same-model conversations and host instances separate', () => {
  const host = logs.createSessionLogger('terminal-bridge', home);
  const a = host.begin('messages', 'conversation-a');
  const b = host.begin('messages', 'conversation-b');
  a.event('route', { provider: 'custom', model: 'same-model' });
  b.event('route', { provider: 'custom', model: 'same-model' });
  b.finish('complete'); a.event('retry', { attempt: 2 }); a.finish('error', 502);
  const again = host.begin('messages', 'conversation-a'); again.finish('complete');
  const other = logs.createSessionLogger('terminal-bridge', home).begin('messages', 'conversation-a'); other.finish('complete');
  expect(again.id).toBe(a.id);
  expect(new Set([a.id, b.id, other.id]).size).toBe(3);
  expect(logs.readSessionLog(a.id, home).filter(e => e.event === 'retry')).toHaveLength(1);
  expect(logs.readSessionLog(b.id, home).some(e => e.event === 'error' || e.event === 'retry')).toBe(false);
  expect(logs.listLogSessions(home)).toHaveLength(3);
});

it('keeps route and status request-scoped when turns overlap or reuse a session', () => {
  const host = logs.createSessionLogger('vscode-chat', home);
  const a = host.begin('native', 'same'), b = host.begin('native', 'same');
  a.event('route', { provider: 'codex', model: 'alpha' });
  b.event('route', { provider: 'anthropic', model: 'beta' });
  a.finish('error', 502); b.finish('complete');
  const endings = logs.readSessionLog(a.id, home).filter(e => e.event === 'error' || e.event === 'complete');
  expect(endings.map(e => [e.event, e.model, e.status])).toEqual([['error', 'alpha', 502], ['complete', 'beta', undefined]]);
  host.begin('native', 'same').finish('complete');
  const last = logs.readSessionLog(a.id, home).at(-1)!;
  expect(last.status).toBeUndefined(); expect(last.model).toBeUndefined();
});

it('never shares missing identities or stores raw identities and unknown fields', () => {
  const host = logs.createSessionLogger('vscode-chat', home);
  const a = host.begin('native', undefined), b = host.begin('native', undefined);
  const c = host.begin('native', '../private-conversation\u001b[31m');
  c.event('route', { provider: 'custom', model: 'safe-model', prompt: 'PRIVATE-PROMPT', error: 'Bearer SECRET' } as any);
  c.event('error', { model: '\u001b]52;c;SECRET\u0007', provider: 'https://secret@example.test', attempt: Infinity } as any);
  a.finish('complete'); b.finish('cancel'); c.finish('error');
  expect(a.id).not.toBe(b.id);
  expect(logs.listLogSessions(home).filter(s => !s.correlated)).toHaveLength(2);
  const bytes = readdirSync(join(home, 'sessions')).filter(f => f.endsWith('.jsonl')).map(f => readFileSync(join(home, 'sessions', f), 'utf8')).join('');
  for (const secret of ['PRIVATE-PROMPT', 'SECRET', 'private-conversation', '\u001b', 'example.test']) expect(bytes).not.toContain(secret);
  expect(logs.readSessionLog('../../auth', home)).toEqual([]);
});

it('preserves colon-qualified model IDs while rejecting URL-shaped labels', () => {
  const request = logs.createSessionLogger('vscode-chat', home).begin('native', 'models');
  request.event('route', { provider: 'custom', model: 'namespace/model:variant' }); request.finish('complete');
  expect(logs.readSessionLog(request.id, home).at(-1)?.model).toBe('namespace/model:variant');
  const unsafe = logs.createSessionLogger('vscode-chat', home).begin('native', 'unsafe');
  unsafe.event('route', { model: 'https://private-endpoint' }); unsafe.finish('complete');
  expect(logs.readSessionLog(unsafe.id, home).at(-1)?.model).toBeUndefined();
});

it('shows recent activity and live heartbeats without claiming crashed requests remain active', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
  const host = logs.createSessionLogger('terminal-bridge', home);
  const idle = host.begin('messages', 'idle'); idle.finish('complete');
  const active = host.begin('messages', 'active');
  vi.advanceTimersByTime(31 * 60_000);
  expect(logs.listLogSessions(home).map(s => [s.id, s.inFlight])).toEqual([[active.id, 1]]);
  active.finish('complete'); active.finish('error');
  expect(logs.readSessionLog(active.id, home).filter(e => e.event === 'complete')).toHaveLength(1);
  vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
  expect(logs.listLogSessions(home)).toEqual([]);
  expect(logs.readSessionLog(idle.id, home).length).toBeGreaterThan(0);
});

it('bounds each generation and total retained sessions, preserving in-flight work', () => {
  const host = logs.createSessionLogger('terminal-bridge', home);
  const active = host.begin('messages', 'keep-active');
  for (let i = 0; i < 1600; i++) active.event('retry', { attempt: i, model: 'm'.repeat(100) });
  for (let i = 0; i < 140; i++) host.begin('messages', `idle-${i}`).finish('complete');
  expect(logs.readSessionLog(active.id, home).length).toBeGreaterThan(0);
  const files = readdirSync(join(home, 'sessions')).filter(f => f.endsWith('.jsonl'));
  expect(files.length).toBeLessThanOrEqual(128);
  expect(readdirSync(join(home, 'sessions')).filter(f => /\.jsonl(?:\.1)?$/.test(f)).every(f => statSync(join(home, 'sessions', f)).size <= 256 * 1024)).toBe(true);
  active.finish('complete');
}, 20_000);

it('ignores corrupt, oversized and injected records and tolerates partial tails', () => {
  const host = logs.createSessionLogger('terminal-bridge', home);
  const a = host.begin('messages', 'a'); a.finish('complete');
  const file = join(home, 'sessions', `${a.id}.jsonl`);
  const record = logs.readSessionLog(a.id, home)[0];
  appendFileSync(file, `${JSON.stringify({ ...record, event: '\u001b[31mINJECT', prompt: 'PRIVATE' })}\n{broken}\n{"partial":`);
  expect(logs.readSessionLog(a.id, home).map(e => e.event)).toEqual(['request', 'complete']);
  expect(logs.listLogSessions(home)).toHaveLength(1);
  writeFileSync(file, 'x'.repeat(300 * 1024));
  expect(logs.readSessionLog(a.id, home)).toEqual([]);
});

it('keeps follower sequence monotonic when a recent session leaves the in-memory cache', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
  const host = logs.createSessionLogger('terminal-bridge', home);
  const first = host.begin('messages', 'first'); first.finish('complete');
  for (let i = 0; i < 127; i++) { vi.setSystemTime(Date.now() + 1000); host.begin('messages', `session-${i}`).finish('complete'); }
  vi.setSystemTime(Date.now() + 1000);
  host.begin('messages', 'first').finish('complete');
  const before = logs.readSessionLog(first.id, home).at(-1)!.sequence;
  host.begin('messages', 'evict-old-memory').finish('complete');
  host.begin('messages', 'first').finish('complete');
  expect(logs.readSessionLog(first.id, home).at(-1)!.sequence).toBeGreaterThan(before);
});

it('fails telemetry harmlessly when storage is unavailable or locked', () => {
  writeFileSync(join(home, 'sessions'), 'not a directory');
  const host = logs.createSessionLogger('terminal-bridge', home);
  expect(() => host.begin('messages', 'a').finish('complete')).not.toThrow();
  expect(logs.listLogSessions(home)).toEqual([]);
  rmSync(join(home, 'sessions'));
  mkdirSync(join(home, 'sessions'));
  writeFileSync(join(home, 'sessions', '.write-lock'), `${process.pid}-busy`);
  expect(() => host.begin('messages', 'b').finish('error')).not.toThrow();
  expect(logs.listLogSessions(home)).toEqual([]);
});

it('recovers a dead writer lock while leaving an unidentifiable corrupt lock alone', () => {
  const dir = join(home, 'sessions'); mkdirSync(dir);
  const lock = join(dir, '.write-lock');
  writeFileSync(lock, '2147483647-dead');
  const host = logs.createSessionLogger('terminal-bridge', home);
  const first = host.begin('messages', 'first'); first.finish('complete');
  expect(logs.listLogSessions(home)).toHaveLength(1);
  writeFileSync(lock, '');
  host.begin('messages', 'second').finish('complete');
  expect(logs.listLogSessions(home)).toHaveLength(1);
});
