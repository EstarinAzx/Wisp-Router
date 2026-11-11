import { randomUUID, createHash } from 'crypto';
import { appendFileSync, closeSync, fstatSync, lstatSync, linkSync, mkdirSync, openSync, opendirSync, readFileSync, readSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wispHomeDir } from './homeStore';

const MAX_BYTES = 256 * 1024;
const MAX_SESSIONS = 128;
const RECENT_MS = 30 * 60_000;
const HEARTBEAT_MS = 30_000;
const ID = /^[a-f0-9]{32}$/;
const SOURCES = ['terminal-bridge', 'vscode-bridge', 'vscode-chat'] as const;
const PROTOCOLS = ['messages', 'responses', 'chat', 'native', 'host'] as const;
const EVENTS = ['request', 'route', 'retry', 'error', 'complete', 'cancel', 'heartbeat', 'start', 'stop'] as const;
export type SessionLogSource = typeof SOURCES[number];
export type SessionLogProtocol = typeof PROTOCOLS[number];
export type SessionLogEvent = typeof EVENTS[number];
export type SessionLogFields = { provider?: string; model?: string; attempt?: number; status?: number };
export type SessionLogEntry = SessionLogFields & {
  id: string; source: SessionLogSource; protocol: SessionLogProtocol; correlated: boolean;
  at: number; sequence: number; inFlight: number; event: SessionLogEvent;
};
export type LogSession = SessionLogEntry;

// Only identifiers, never messages, exception strings, URLs or conversation payloads.
const label = (value: unknown): string | undefined => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/[\]()+:-]{0,127}$/.test(value)
  && !/\/\//.test(value) && !/^(?:sk-|Bearer|eyJ)/i.test(value) ? value : undefined;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const fields = (value: SessionLogFields): SessionLogFields => ({
  ...(label(value.provider) ? { provider: label(value.provider) } : {}),
  ...(label(value.model) ? { model: label(value.model) } : {}),
  ...(integer(value.attempt) ? { attempt: value.attempt } : {}),
  ...(integer(value.status) && value.status! >= 100 && value.status! <= 599 ? { status: value.status } : {}),
});
const decode = (value: any, id: string): SessionLogEntry | undefined => {
  if (!value || value.id !== id || !SOURCES.includes(value.source) || !PROTOCOLS.includes(value.protocol)
    || !EVENTS.includes(value.event) || typeof value.correlated !== 'boolean' || !integer(value.at)
    || value.at > 8_640_000_000_000_000 || !integer(value.sequence) || !integer(value.inFlight)) return;
  return { id, source: value.source, protocol: value.protocol, correlated: value.correlated, at: value.at,
    sequence: value.sequence, inFlight: value.inFlight, event: value.event, ...fields(value) };
};
const readFile = (path: string, id: string, tail = false): SessionLogEntry[] => {
  let fd: number | undefined;
  try {
    if (!lstatSync(path).isFile()) return [];
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    if (size > MAX_BYTES) return [];
    const start = tail ? Math.max(0, size - 8192) : 0;
    const bytes = Buffer.alloc(size - start);
    const count = readSync(fd, bytes, 0, bytes.length, start);
    const lines = bytes.subarray(0, count).toString('utf8').split('\n');
    if (start) lines.shift();
    return lines.flatMap(line => {
      try { const entry = decode(JSON.parse(line), id); return entry ? [entry] : []; } catch { return []; }
    });
  } catch { return []; } finally { if (fd !== undefined) closeSync(fd); }
};
const latest = (id: string, home: string): SessionLogEntry | undefined => {
  const path = join(home, 'sessions', `${id}.jsonl`);
  return readFile(path, id, true).at(-1) ?? readFile(`${path}.1`, id, true).at(-1);
};

export const readSessionLog = (id: string, home = wispHomeDir()): SessionLogEntry[] => {
  if (!ID.test(id)) return [];
  const path = join(home, 'sessions', `${id}.jsonl`);
  return [...readFile(`${path}.1`, id), ...readFile(path, id)];
};
const sessionIds = (dir: string): string[] => {
  const ids: string[] = [];
  try {
    const handle = opendirSync(dir);
    try {
      // Bound even a corrupt directory; normal writers retain at most 128 sessions.
      for (let n = 0; n < 1024; n++) {
        const entry = handle.readSync(); if (!entry) break;
        if (entry.isFile() && /^[a-f0-9]{32}\.jsonl$/.test(entry.name)) ids.push(entry.name.slice(0, 32));
      }
    } finally { handle.closeSync(); }
  } catch { /* absent or unavailable telemetry */ }
  return ids;
};
const live = (entry: SessionLogEntry, now: number): boolean => entry.inFlight > 0 && now - entry.at < HEARTBEAT_MS * 3;
export const listLogSessions = (home = wispHomeDir(), includeHosts = false): LogSession[] => {
  const now = Date.now();
  return sessionIds(join(home, 'sessions')).flatMap(id => {
    const entry = latest(id, home);
    return entry && (includeHosts || entry.protocol !== 'host') && now - entry.at <= RECENT_MS
      ? [{ ...entry, inFlight: live(entry, now) ? entry.inFlight : 0 }] : [];
  }).sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
};

export const formatSessionLog = (entry: SessionLogEntry): string =>
  `[${new Date(entry.at).toISOString()}] ${entry.event}${entry.provider ? ` provider=${entry.provider}` : ''}${entry.model ? ` model=${entry.model}` : ''}${entry.attempt !== undefined ? ` attempt=${entry.attempt}` : ''}${entry.status !== undefined ? ` status=${entry.status}` : ''}`;

export const createSessionLogger = (source: SessionLogSource, home = wispHomeDir()) => {
  const host = randomUUID();
  const dir = join(home, 'sessions');
  const owner = `${process.pid}-${host}`;
  const lock = join(dir, '.write-lock');
  const sessions = new Map<string, SessionLogEntry>();
  let sequence = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const write = (entry: SessionLogEntry): void => {
    const candidate = join(dir, `.writer-${owner}-${entry.sequence}`);
    let locked = false;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) return;
      // No waits in request execution. A busy/unavailable store drops telemetry, never the chat.
      try {
        if (lstatSync(lock).isFile() && lstatSync(lock).size < 128) {
          const previous = readFileSync(lock, 'utf8');
          if (/^\d+-[\w-]+$/.test(previous)) {
            try { process.kill(Number(previous.split('-')[0]), 0); }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                const recovery = join(dir, `.recover-${previous}`);
                mkdirSync(recovery, { mode: 0o700 });
                try { if (readFileSync(lock, 'utf8') === previous) unlinkSync(lock); }
                finally { rmdirSync(recovery); }
              }
            }
          }
        }
      } catch { /* missing, corrupt, live or already claimed lock */ }
      writeFileSync(candidate, owner, { flag: 'wx', mode: 0o600 });
      // A hard link publishes the complete owner atomically, without Windows directory-rename races.
      linkSync(candidate, lock); locked = true;
      const path = join(dir, `${entry.id}.jsonl`);
      let size = 0;
      try { const stat = lstatSync(path); if (!stat.isFile()) return; size = stat.size; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
        const ids = sessionIds(dir);
        if (ids.length >= MAX_SESSIONS) {
          const candidates = ids.map(id => ({ id, last: latest(id, home) }))
            .filter(s => !s.last || !live(s.last, Date.now()))
            .sort((a, b) => (a.last?.at ?? 0) - (b.last?.at ?? 0));
          if (!candidates.length) return;
          const victim = join(dir, `${candidates[0].id}.jsonl`);
          unlinkSync(victim);
          try { unlinkSync(`${victim}.1`); } catch { /* no previous generation */ }
        }
      }
      const line = `\n${JSON.stringify(entry)}\n`;
      if (size + Buffer.byteLength(line) > MAX_BYTES) renameSync(path, `${path}.1`);
      appendFileSync(path, line, { mode: 0o600 });
    } catch { /* best-effort telemetry */ }
    finally {
      try {
        if (locked) unlinkSync(lock);
        unlinkSync(candidate);
      } catch { /* unavailable store; never remove another writer's lock */ }
    }
  };
  const emit = (entry: SessionLogEntry, event: SessionLogEvent, values: SessionLogFields = {}) => {
    const safe = fields(values);
    Object.assign(entry, { provider: undefined, model: undefined, attempt: undefined, status: undefined }, safe,
      { event, at: Date.now(), sequence: ++sequence });
    write(entry);
  };
  const begin = (protocol: SessionLogProtocol, identity?: unknown) => {
    const correlated = typeof identity === 'string' && identity.trim().length > 0 && identity.length <= 2048;
    const id = createHash('sha256').update(`${host}\0${protocol}\0${correlated ? identity : randomUUID()}`).digest('hex').slice(0, 32);
    let entry = sessions.get(id);
    if (!entry) {
      if (sessions.size >= MAX_SESSIONS) {
        const idle = [...sessions].find(([, item]) => !item.inFlight);
        if (idle) sessions.delete(idle[0]);
      }
      entry = { id, source, protocol, correlated, at: Date.now(), sequence: 0, inFlight: 0, event: 'request' };
      if (sessions.size < MAX_SESSIONS) sessions.set(id, entry);
    }
    entry.inFlight++;
    emit(entry, 'request');
    if (!heartbeat) {
      heartbeat = setInterval(() => { for (const item of sessions.values()) if (item.inFlight) emit(item, 'heartbeat', item); }, HEARTBEAT_MS);
      heartbeat.unref?.();
    }
    let finished = false;
    const requestFields: SessionLogFields = {};
    return {
      id,
      event: (event: SessionLogEvent, values: SessionLogFields = {}) => {
        if (!finished && EVENTS.includes(event)) { Object.assign(requestFields, fields(values)); emit(entry, event, requestFields); }
      },
      finish: (outcome: 'complete' | 'error' | 'cancel', status?: number) => {
        if (finished) return; finished = true; entry.inFlight--;
        emit(entry, outcome, { ...requestFields, status });
        if (![...sessions.values()].some(item => item.inFlight)) { clearInterval(heartbeat); heartbeat = undefined; }
      },
    };
  };
  const hostEntry: SessionLogEntry = { id: createHash('sha256').update(host).digest('hex').slice(0, 32), source,
    protocol: 'host', correlated: true, at: Date.now(), sequence: 0, inFlight: 0, event: 'start' };
  return { begin, lifecycle: (event: 'start' | 'stop') => { emit(hostEntry, event); return hostEntry.id; } };
};
export type SessionLogger = ReturnType<typeof createSessionLogger>;
export type SessionRequestLog = ReturnType<SessionLogger['begin']>;
