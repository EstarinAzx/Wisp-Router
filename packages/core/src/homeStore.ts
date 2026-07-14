// ----------------- homeStore.ts — Wisp home store: ~/.wisp file I/O (atomic, owner-only, watched) ----------------- //

/*
 * Depends on:
 *   - node fs/os/path/crypto: the store IS the filesystem — tiny sync reads/writes (files are <10 KB),
 *     tmp+rename for atomicity, fs.watch for external-edit pickup.
 *   - ./home: the pure schema layer — parse/serialize; this module never interprets field contents.
 *
 * Data shapes:
 *   - WispConfig / WispAuth (from ./home): the parsed forms of config.json and auth.json.
 *
 * Both the extension and the TUI hold a WispHome each; the file is the single source of truth
 * (ADR-0002). Writes are read-merge-write with a tmp+rename swap so a concurrent reader never sees
 * a torn file; logical races (two-process OAuth refresh) are the callers' job via re-read-before-refresh.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { parseWispAuth, parseWispConfig, serializeWispStore, type WispAuth, type WispConfig } from './home';

// ----------------------------- Paths ----------------------------- //

// The per-user store root. WISP_HOME override mirrors CODEX_HOME — useful for tests and sandboxes.
export const wispHomeDir = (): string => process.env.WISP_HOME?.trim() || join(homedir(), '.wisp');

const CONFIG_FILE = 'config.json';
const AUTH_FILE = 'auth.json';

// ----------------------------- WispHome ----------------------------- //

// One handle on the store directory. All methods are sync — the files are tiny and sync keeps the
// read-merge-write window as small as it can be without locks.
export class WispHome {
  constructor(private readonly dir: string = wispHomeDir()) {}

  private path = (file: string): string => join(this.dir, file);

  // 0o700 on POSIX; on Windows chmod is a near-no-op and %USERPROFILE% ACLs do the guarding (ADR-0002,
  // same posture as Codex CLI / opencode).
  private ensureDir = (): void => { mkdirSync(this.dir, { recursive: true, mode: 0o700 }); };

  private readRaw = (file: string): string | undefined => {
    try { return readFileSync(this.path(file), 'utf8'); } catch { return undefined; }
  };

  // Atomic swap: write a process-unique tmp in the same dir (same volume, so rename is atomic), then
  // rename over the target. mode rides the tmp file through the rename. Any failure (mid-write ENOSPC
  // included) cleans the tmp up best-effort so the dir never accumulates litter.
  private writeRaw = (file: string, text: string, mode: number): void => {
    this.ensureDir();
    const tmp = this.path(`${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
    try {
      writeFileSync(tmp, text, { mode });
      renameSync(tmp, this.path(file));
    } catch (err) {
      try { unlinkSync(tmp); } catch { /* best-effort litter cleanup */ }
      throw err;
    }
  };

  // Shallow read-merge-write. JSON.stringify drops undefined values, so `field: undefined` in a patch
  // deletes the field on disk; unknown keys parsed off disk ride the spread and survive.
  private merge = <T extends object>(file: string, current: T, patch: Partial<T>, mode: number): T => {
    const next = { ...current, ...patch };
    this.writeRaw(file, serializeWispStore(next), mode);
    return next;
  };

  readConfig = (): WispConfig => parseWispConfig(this.readRaw(CONFIG_FILE));
  configExists = (): boolean => existsSync(this.path(CONFIG_FILE));
  writeConfig = (patch: Partial<WispConfig>): WispConfig => this.merge(CONFIG_FILE, this.readConfig(), patch, 0o644);

  readAuth = (): WispAuth => parseWispAuth(this.readRaw(AUTH_FILE));
  authExists = (): boolean => existsSync(this.path(AUTH_FILE));
  // Secrets file — owner-only (0o600) per ADR-0002.
  writeAuth = (patch: Partial<WispAuth>): WispAuth => this.merge(AUTH_FILE, this.readAuth(), patch, 0o600);

  // Watch the DIRECTORY, not the files — atomic rename-swaps replace the inode, which silently kills
  // per-file watchers on some platforms. Debounced so one swap (tmp create + rename) fires once.
  watch = (onChange: () => void): { dispose: () => void } => {
    this.ensureDir();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watcher: FSWatcher | undefined;
    try {
      watcher = watch(this.dir, { persistent: false }, (_event, name) => {
        if (name && !name.endsWith('.json')) return; // ignore our own .tmp churn
        if (timer) clearTimeout(timer);
        timer = setTimeout(onChange, 100);
      });
      // An unhandled 'error' EVENT (dir deleted, Windows EPERM on a stale handle) would crash the host
      // process — the try/catch above only covers the synchronous watch() throw. Degrade to unwatched.
      watcher.on('error', () => { watcher?.close(); });
    } catch { /* watch unavailable (rare fs) → callers fall back to read-on-demand */ }
    return { dispose: () => { if (timer) clearTimeout(timer); watcher?.close(); } };
  };
}
