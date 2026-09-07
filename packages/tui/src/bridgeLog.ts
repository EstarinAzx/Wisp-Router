// -------- bridgeLog.ts — the terminal Bridge log writer + the headless `wisp log` reader -------- //

/*
 * Depends on:
 *   - node fs/path: the log IS the filesystem — append-only writes, offset reads for the follower.
 *   - @wisp/core: wispHomeDir, so the WISP_HOME override rule lives in exactly one place.
 *
 * Data shapes: LogCursor keeps the file identity and last printed byte together.
 *
 * The shared terminal host keeps its screen/console output and appends every Bridge log line here, so
 * the user can read what the Bridge said from any other terminal — live (`-f`) or post-mortem. The file
 * is regenerable telemetry like status.json: never overwrite-protected (#182's rule guards stores whose
 * contents the user cannot regenerate), and invisible to the home-store directory watcher through the
 * existing non-`.json` name filter (homeStore.watch) — no watcher change was needed for it.
 *
 * Every write is best-effort and swallowed. Telemetry must never take the Bridge down.
 */

import {
  appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, renameSync, statSync, watchFile,
} from 'fs';
import { join } from 'path';
import { wispHomeDir } from '@wisp/core';

// ----------------------------- Paths ----------------------------- //

const LOG_FILE = 'bridge.log';

export const bridgeLogPath = (): string => join(wispHomeDir(), LOG_FILE);

// One generation only, by design: no size or time policy to tune, and the previous run stays readable
// after a restart. `.1` is deliberately not `.json` so the home watcher keeps ignoring it too.
const rotatedPath = (): string => `${bridgeLogPath()}.1`;

// ----------------------------- Writer (terminal hosts) ----------------------------- //

// The stamp is a prefix, never a rewrite: whatever the Bridge said rides through verbatim after it.
export const stampLine = (message: string, at: Date = new Date()): string => `[${at.toISOString()}] ${message}\n`;

// Called on the first successful start per host. renameSync replaces an existing `.1` on POSIX and Windows.
export const rotateBridgeLog = (): void => {
  try {
    mkdirSync(wispHomeDir(), { recursive: true, mode: 0o700 });
    if (existsSync(bridgeLogPath())) renameSync(bridgeLogPath(), rotatedPath());
  } catch { /* best-effort — a log that cannot rotate must not stop the Bridge starting */ }
};

export const appendBridgeLog = (message: string, at?: Date): void => {
  try { appendFileSync(bridgeLogPath(), stampLine(message, at), { mode: 0o644 }); } catch { /* best-effort */ }
};

// ----------------------------- Reader (`wisp log`) ----------------------------- //

// Named so staleness is self-evident: a log whose last write was hours ago is a dead Bridge, and the
// header says so before a single line of content invites the wrong conclusion.
export const logHeader = (path: string, mtime: Date): string => `${path}  (last write: ${mtime.toISOString()})`;

type LogCursor = { ino: number; dev: number; offset: number };

// Keep the identity of the file actually read, not the watcher's independently sampled baseline.
// Reads by fd keep a long-lived follow O(appended), not O(file) per tick.
const printFrom = (path: string, previous?: LogCursor): LogCursor | undefined => {
  let fd: number;
  try { fd = openSync(path, 'r'); } catch (err) {
    // Rotation briefly removes the path. Keep following so the next file starts at byte zero.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    const { size, ino, dev } = fstatSync(fd);
    const cursor = { ino, dev, offset: previous?.ino === ino && previous.dev === dev && size >= previous.offset
      ? previous.offset : 0 };
    if (size === cursor.offset) return cursor;
    const buf = Buffer.alloc(size - cursor.offset);
    const read = readSync(fd, buf, 0, buf.length, cursor.offset);
    process.stdout.write(buf.subarray(0, read));
    cursor.offset += read;
    return cursor;
  } finally { closeSync(fd); }
};

// Renderer-free, like `routing` / `snapshot` / `providers` — imports node fs and core only, never opentui.
export const runLogCli = (args: string[]): number => {
  const follow = args.includes('-f') || args.includes('--follow');
  const path = bridgeLogPath();

  if (!existsSync(path)) {
    console.log(`No Bridge log yet at ${path} — run \`wisp serve\` to start one.`);
    return 0;
  }

  console.log(logHeader(path, statSync(path).mtime));
  let cursor = printFrom(path);
  if (!follow) return 0;

  // watchFile polls, which is what survives an append-only writer on every platform we ship to (fs.watch
  // misses appends on some Windows setups). It is persistent, so it holds the event loop open until Ctrl+C.
  watchFile(path, { interval: 300 }, () => { cursor = printFrom(path, cursor); });
  // Close the gap between the initial read and registering the follower.
  cursor = printFrom(path, cursor);
  return 0;
};
