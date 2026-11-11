import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSessionLogger } from '@wisp/core';
import { runLogCli } from '../src/bridgeLog';

let home: string, prior: string | undefined;
beforeEach(() => { prior = process.env.WISP_HOME; home = mkdtempSync(join(tmpdir(), 'wisp-log-cli-')); process.env.WISP_HOME = home; });
afterEach(() => { if (prior === undefined) delete process.env.WISP_HOME; else process.env.WISP_HOME = prior; rmSync(home, { recursive: true, force: true }); });
const capture = (args: string[]) => {
  const lines: string[] = [], log = console.log, error = console.error;
  console.log = console.error = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
  try { return { code: runLogCli(args), out: lines.join('\n') }; }
  finally { console.log = log; console.error = error; }
};
test('empty log lists sessions without creating a Bridge or asking to start one', () => {
  const result = capture([]);
  expect(result.code).toBe(0); expect(result.out).toContain('No recent chat sessions');
  expect(result.out).toContain('wisp log <session-id>');
});
test('lists stable IDs and reads only the selected conversation', () => {
  const host = createSessionLogger('vscode-chat', home);
  const a = host.begin('native', 'a'), b = host.begin('native', 'b');
  a.event('route', { model: 'model-a' }); b.event('route', { model: 'model-b' });
  a.finish('complete'); b.finish('error');
  const list = capture([]);
  expect(list.out).toContain(a.id); expect(list.out).toContain(b.id); expect(list.out).toContain('vscode-chat');
  const detail = capture([a.id]);
  expect(detail.code).toBe(0); expect(detail.out).toContain('model-a'); expect(detail.out).not.toContain('model-b');
});
test.each([['-f'], ['--unknown'], ['../auth.json'], ['a'.repeat(32)], ['a', 'b']])('rejects missing, unknown or invalid selection: %j', (...args) => {
  expect(capture(args).code).toBe(1);
});
