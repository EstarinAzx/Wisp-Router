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

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { isUnusableStore, parseWispAuth, parseWispConfig, serializeWispStore, type WispAuth, type WispConfig } from './home';
import { mergeStatus, type WispStatus } from './status';
import { parseQuotaCache, type QuotaCache } from './quota';

// ----------------------------- Paths ----------------------------- //

// The per-user store root. WISP_HOME override mirrors CODEX_HOME — useful for tests and sandboxes.
export const wispHomeDir = (): string => process.env.WISP_HOME?.trim() || join(homedir(), '.wisp');

const CONFIG_FILE = 'config.json';
const AUTH_FILE = 'auth.json';
// #171: the statusline snapshot. Not config and not a secret — volatile per-turn telemetry, rewritten by
// the Bridge after every bridged turn, read only by the out-of-process statusline script.
const STATUS_FILE = 'status.json';
const QUOTA_FILE = 'quota.json';

export class QuotaRefreshBusyError extends Error {
  constructor() { super('Quota refresh is busy.'); }
}

// ----------------------------- WispHome ----------------------------- //

// Tiny file operations are synchronous. Explicit quota refresh additionally holds a cross-process lock.
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
  //
  // #182: the read is deliberately permissive — an unreadable store parses as {} so wisp still starts and
  // routes on defaults. The WRITE is where that has to stop. Merging {} with a patch and putting it back
  // does not ignore the file, it ERASES it, and the contents we are erasing are precisely the ones we just
  // admitted we could not parse. So a store that holds content we did not understand is never overwritten;
  // the caller gets the same kind of throw writeRaw already produces for ENOSPC/EPERM, which is why no call
  // site needs a new policy for this. "Nothing there" (absent/empty) is not that case and stays writable.
  private merge = <T extends object>(file: string, parse: (raw?: string) => T, patch: Partial<T>, mode: number): T => {
    const raw = this.readRaw(file);
    if (isUnusableStore(raw)) throw new Error(
      `${this.path(file)} exists but could not be read as JSON. Wisp will not overwrite it — that would ` +
      `destroy whatever it holds. Repair the file, or move it aside to start fresh, then retry.`,
    );
    const next = { ...parse(raw), ...patch };
    this.writeRaw(file, serializeWispStore(next), mode);
    return next;
  };

  readConfig = (): WispConfig => parseWispConfig(this.readRaw(CONFIG_FILE));
  configExists = (): boolean => existsSync(this.path(CONFIG_FILE));
  writeConfig = (patch: Partial<WispConfig>): WispConfig => this.merge(CONFIG_FILE, parseWispConfig, patch, 0o644);

  readAuth = (): WispAuth => parseWispAuth(this.readRaw(AUTH_FILE));
  authExists = (): boolean => existsSync(this.path(AUTH_FILE));
  // Secrets file — owner-only (0o600) per ADR-0002.
  writeAuth = (patch: Partial<WispAuth>): WispAuth => this.merge(AUTH_FILE, parseWispAuth, patch, 0o600);

  quotaAuthRevision = (): string | undefined => {
    try {
      const stat = statSync(this.path(AUTH_FILE), { bigint: true });
      if (!stat.isFile()) return undefined;
      // ponytail: any auth-file write invalidates both Providers; add per-Provider revisions if needed.
      return `v1:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    } catch { return undefined; }
  };

  readQuota = (): QuotaCache => {
    try { return parseQuotaCache(JSON.parse(this.readRaw(QUOTA_FILE)?.replace(/^\uFEFF/, '') ?? 'null')); }
    catch { return { schema: 1, providers: {} }; }
  };

  writeQuota = (cache: QuotaCache): void => {
    this.writeRaw(QUOTA_FILE, `${JSON.stringify(parseQuotaCache(cache), null, 2)}\n`, 0o600);
  };

  withQuotaRefreshLock = async <T>(action: () => Promise<T>): Promise<T> => {
    this.ensureDir();
    const path = this.path('quota-refresh.lock');
    const open = (file: string): number => {
      try { return openSync(file, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new QuotaRefreshBusyError();
        throw error;
      }
    };
    let fd: number | undefined;
    try {
      try { fd = open(path); }
      catch (error) {
        if (!(error instanceof QuotaRefreshBusyError)) throw error;
        // Elect ONE reclaimer before inspecting the owner. Two stat/unlink reclaimers could otherwise
        // remove a newly acquired live lock. No age-based stealing, even for an ancient lock.
        const recovery = `${path}.reclaim`;
        const guard = open(recovery);
        try {
          let owner: unknown;
          try { owner = JSON.parse(readFileSync(path, 'utf8')); }
          catch (readError) {
            if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') throw new QuotaRefreshBusyError();
          }
          if (owner !== undefined) {
            const pid = (owner as { pid?: unknown } | null)?.pid;
            if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) throw new QuotaRefreshBusyError();
            let dead = false;
            try { process.kill(pid, 0); }
            catch (probeError) { dead = (probeError as NodeJS.ErrnoException).code === 'ESRCH'; }
            if (!dead) throw new QuotaRefreshBusyError();
            unlinkSync(path);
          }
          fd = open(path);
        } finally {
          try { closeSync(guard); } finally { unlinkSync(recovery); }
        }
        // ponytail: a crash during recovery (or before writing a PID) fails closed as busy; manual
        // recovery after all Wisp processes stop avoids an unsafe second layer of lock stealing.
      }
      writeFileSync(fd, JSON.stringify({ pid: process.pid }));
      return await action();
    } finally {
      if (fd !== undefined) { try { closeSync(fd); } finally { unlinkSync(path); } }
    }
  };

  // The previous snapshot, or undefined when there is none / it does not parse. Unlike config.json and
  // auth.json this file is NEVER protected from overwrite (#182's rule is about stores that hold something
  // the user cannot regenerate) — a corrupt status.json is one turn of telemetry, and the next turn fixes it.
  readStatus = (): WispStatus | undefined => {
    const raw = this.readRaw(STATUS_FILE);
    if (raw === undefined) return undefined;
    try { return JSON.parse(raw) as WispStatus; } catch { return undefined; }
  };

  // #171: overwrite the statusline snapshot. Every field of the ACTIVE Provider is recomputed per turn, so
  // the write is whole-file rather than a key merge — a leftover key would be a stale reading, not a
  // default. The one thing carried across is the quota ledger: mergeStatus moves the outgoing Provider's
  // meters into `providers` so a route switch does not blank what the other wire last said about itself.
  // Failures are swallowed: telemetry must never take a turn down.
  writeStatus = (status: WispStatus): void => {
    try {
      const merged = mergeStatus(this.readStatus(), status);
      this.writeRaw(STATUS_FILE, `${JSON.stringify(merged, null, 2)}\n`, 0o644);
    } catch { /* best-effort */ }
  };

  // Watch the DIRECTORY, not the files — atomic rename-swaps replace the inode, which silently kills
  // per-file watchers on some platforms. Debounced so one swap (tmp create + rename) fires once.
  watch = (onChange: () => void): { dispose: () => void } => {
    this.ensureDir();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watcher: FSWatcher | undefined;
    try {
      watcher = watch(this.dir, { persistent: false }, (_event, name) => {
        if (name && !name.endsWith('.json')) return; // ignore our own .tmp churn
        // #171: status.json is rewritten every bridged turn. It is nobody's config, so waking both faces
        // to re-read config.json on each turn would be pure churn.
        if (name === STATUS_FILE || name === QUOTA_FILE) return;
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
