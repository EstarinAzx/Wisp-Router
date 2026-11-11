// Renderer-free session list/detail/follow shared with the TUI's filesystem readers.
import { formatSessionLog, listLogSessions, readSessionLog, type LogSession } from '@wisp/core';

export const sessionLabel = (session: LogSession): string =>
  `${session.id}  ${session.source}/${session.protocol}  ${session.inFlight ? `in flight (${session.inFlight})` : 'idle'}${session.correlated ? '' : ' · uncorrelated request'}`;
export const sessionDetail = (session: LogSession): string =>
  `${session.provider ?? 'unrouted'}${session.model ? ` / ${session.model}` : ''} · last activity ${new Date(session.at).toISOString()}`;

export const runLogCli = (args: string[], listOnly = false): number => {
  const follow = args.includes('-f') || args.includes('--follow');
  const ids = args.filter(arg => arg !== '-f' && arg !== '--follow');
  if (ids.length > 1 || (follow && !ids.length) || (listOnly && args.length)) {
    console.error('Usage: wisp logs | wisp log <session-id> [-f|--follow]'); return 1;
  }
  const id = ids[0];
  if (!id) {
    const sessions = listLogSessions();
    console.log('Chat sessions · activity in the last 30 minutes (not open-tab detection)');
    if (!sessions.length) console.log('No recent chat sessions.');
    for (const session of sessions) { console.log(sessionLabel(session)); console.log(`  ${sessionDetail(session)}`); }
    const hosts = listLogSessions(undefined, true).filter(session => session.protocol === 'host');
    if (hosts.length) { console.log('Host lifecycle streams (not chats)'); for (const host of hosts) console.log(sessionLabel(host)); }
    console.log('Read one: wisp log <session-id> [-f|--follow]');
    return 0;
  }
  const entries = readSessionLog(id);
  if (!entries.length) { console.error('Unknown or unavailable session ID. Run wisp logs to list recent sessions.'); return 1; }
  const summary = listLogSessions(undefined, true).find(session => session.id === id);
  console.log(sessionLabel(summary ?? { ...entries.at(-1)!, inFlight: 0 }));
  let sequence = -1;
  const print = () => {
    for (const entry of readSessionLog(id)) if (entry.sequence > sequence) {
      console.log(formatSessionLog(entry)); sequence = entry.sequence;
    }
  };
  print();
  if (follow) { setInterval(print, 300); print(); }
  return 0;
};
