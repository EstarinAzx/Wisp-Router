// ---------------- bridgeLog.test.ts — Bridge log file: stamp, rotate, append, read, follow (#202) ---------------- //

/*
 * Depends on:
 *   - bun:test: the runner (outside the tsc include on purpose — no bun-types in the tsc gate).
 *   - ../src/bridgeLog: the writer + reader under test.
 *   - node fs/os/path: a real sandboxed WISP_HOME, never the user's ~/.wisp.
 * Data shapes: none.
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unwatchFile, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendBridgeLog, bridgeLogPath, logHeader, rotateBridgeLog, runLogCli, stampLine } from '../src/bridgeLog';

// ----------------------------------------- Sandbox ----------------------------------------- //

let home: string;
let priorHome: string | undefined;

beforeEach(() => {
  priorHome = process.env.WISP_HOME;
  home = mkdtempSync(join(tmpdir(), 'wisp-log-'));
  process.env.WISP_HOME = home;
});

afterEach(() => {
  // The follower is persistent — an un-cleared watch would hold the test process open.
  unwatchFile(join(home, 'bridge.log'));
  if (priorHome === undefined) delete process.env.WISP_HOME; else process.env.WISP_HOME = priorHome;
  rmSync(home, { recursive: true, force: true });
});

const logPath = () => join(home, 'bridge.log');

// Capture both channels the reader writes on: console.log for the header, stdout for file content.
const capture = (run: () => void): string => {
  const out: string[] = [];
  const log = console.log;
  const write = process.stdout.write;
  console.log = (...a: unknown[]) => { out.push(`${a.join(' ')}\n`); };
  (process.stdout as { write: unknown }).write = (chunk: unknown) => { out.push(String(chunk)); return true; };
  try { run(); } finally { console.log = log; (process.stdout as { write: unknown }).write = write; }
  return out.join('');
};

// ----------------------------------------- Stamp ----------------------------------------- //

test('stamps an ISO timestamp and leaves the line verbatim', () => {
  const at = new Date('2026-08-14T13:52:37.123Z');
  expect(stampLine('POST /v1/messages 200', at)).toBe('[2026-08-14T13:52:37.123Z] POST /v1/messages 200\n');
});

test('does not mangle a line that already contains brackets or newlines', () => {
  const at = new Date('2026-08-14T00:00:00.000Z');
  expect(stampLine('[engine] a\nb', at)).toBe('[2026-08-14T00:00:00.000Z] [engine] a\nb\n');
});

// ----------------------------------------- Rotate ----------------------------------------- //

test('rotate with no existing log creates nothing', () => {
  rotateBridgeLog();
  expect(existsSync(logPath())).toBe(false);
  expect(existsSync(`${logPath()}.1`)).toBe(false);
});

test('rotate moves the previous run one generation aside', () => {
  writeFileSync(logPath(), 'previous run\n');
  rotateBridgeLog();
  expect(existsSync(logPath())).toBe(false);
  expect(readFileSync(`${logPath()}.1`, 'utf8')).toBe('previous run\n');
});

test('rotate replaces an older .1 — one generation, no accumulation', () => {
  writeFileSync(`${logPath()}.1`, 'two runs ago\n');
  writeFileSync(logPath(), 'previous run\n');
  rotateBridgeLog();
  expect(readFileSync(`${logPath()}.1`, 'utf8')).toBe('previous run\n');
  expect(existsSync(`${logPath()}.2`)).toBe(false);
});

test('rotate creates the home dir when it does not exist yet', () => {
  const fresh = join(home, 'nested');
  process.env.WISP_HOME = fresh;
  rotateBridgeLog();
  expect(existsSync(fresh)).toBe(true);
  process.env.WISP_HOME = home;
});

// ----------------------------------------- Append ----------------------------------------- //

test('append creates the file and keeps appending in order', () => {
  appendBridgeLog('first', new Date('2026-08-14T00:00:00.000Z'));
  appendBridgeLog('second', new Date('2026-08-14T00:00:01.000Z'));
  expect(readFileSync(logPath(), 'utf8')).toBe(
    '[2026-08-14T00:00:00.000Z] first\n[2026-08-14T00:00:01.000Z] second\n',
  );
});

test('append never throws when the home is unwritable', () => {
  // A path whose parent is a FILE cannot be created — the write must be swallowed, not surfaced.
  const blocker = join(home, 'blocker');
  writeFileSync(blocker, 'not a directory');
  process.env.WISP_HOME = join(blocker, 'inner');
  expect(() => appendBridgeLog('swallowed')).not.toThrow();
  process.env.WISP_HOME = home;
});

test('bridgeLogPath follows WISP_HOME', () => {
  expect(bridgeLogPath()).toBe(logPath());
});

// ----------------------------------------- Read ----------------------------------------- //

test('with no log it points at wisp serve and exits 0', () => {
  let code = -1;
  const out = capture(() => { code = runLogCli([]); });
  expect(code).toBe(0);
  expect(out).toContain('wisp serve');
  expect(out).toContain(logPath());
});

test('prints the header then the file verbatim', () => {
  writeFileSync(logPath(), '[t] one\n[t] two\n');
  let code = -1;
  const out = capture(() => { code = runLogCli([]); });
  expect(code).toBe(0);
  const [header, ...rest] = out.split('\n');
  expect(header).toContain(logPath());
  expect(header).toContain('last write:');
  expect(rest.join('\n')).toBe('[t] one\n[t] two\n');
});

test('the header names the file and its last-write time', () => {
  expect(logHeader('/w/bridge.log', new Date('2026-08-14T13:52:37.123Z')))
    .toBe('/w/bridge.log  (last write: 2026-08-14T13:52:37.123Z)');
});

// ----------------------------------------- Follow ----------------------------------------- //

test('-f prints the existing content then streams what is appended after', async () => {
  writeFileSync(logPath(), 'before\n');
  const out: string[] = [];
  const log = console.log;
  const write = process.stdout.write;
  console.log = (...a: unknown[]) => { out.push(`${a.join(' ')}\n`); };
  (process.stdout as { write: unknown }).write = (chunk: unknown) => { out.push(String(chunk)); return true; };
  try {
    expect(runLogCli(['-f'])).toBe(0);
    expect(out.join('')).toContain('before\n');
    appendBridgeLog('after', new Date('2026-08-14T00:00:00.000Z'));
    // watchFile polls at 300ms; wait in slices so a fast tick finishes fast and a slow one still passes.
    for (let i = 0; i < 40 && !out.join('').includes('after'); i++) await new Promise((r) => setTimeout(r, 100));
  } finally {
    unwatchFile(logPath());
    console.log = log;
    (process.stdout as { write: unknown }).write = write;
  }
  expect(out.join('')).toContain('] after\n');
  // The already-printed content is not reprinted on each tick.
  expect(out.join('').match(/before/g)?.length).toBe(1);
});

test('-f catches rotation between the initial read and watcher registration', async () => {
  writeFileSync(logPath(), 'before\n');
  const out: string[] = [];
  const log = console.log;
  const write = process.stdout.write;
  console.log = (...args: unknown[]) => { out.push(`${args.join(' ')}\n`); };
  (process.stdout as { write: unknown }).write = (chunk: unknown) => {
    const text = String(chunk);
    out.push(text);
    if (text === 'before\n') {
      renameSync(logPath(), `${logPath()}.1`);
      writeFileSync(logPath(), 'after!\n');
    }
    return true;
  };
  try {
    expect(runLogCli(['-f'])).toBe(0);
    // Give the watcher time to adopt its first baseline before a later append wakes it.
    await new Promise((resolve) => setTimeout(resolve, 650));
    appendFileSync(logPath(), 'tail\n');
    for (let i = 0; i < 40 && !out.join('').includes('tail\n'); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    unwatchFile(logPath());
    console.log = log;
    (process.stdout as { write: unknown }).write = write;
  }
  expect(out.join('')).toContain('after!\ntail\n');
  expect(out.join('').match(/before\n/g)?.length).toBe(1);
});
