// ---------------------------- logBuffer.ts — the Bridge log ring buffer (#122) ---------------------------- //

/*
 * Depends on: nothing — pure state.
 *
 * Data shapes:
 *   - RingLog: push/lines/subscribe — a capped line list trimmed from the front, with
 *     change subscribers (the open Log Screen's re-render hook).
 */

// ----------------------------- Ring log ----------------------------- //

export const LOG_CAP = 500;

export type RingLog = ReturnType<typeof createRingLog>;

// Shell-owned: collects whenever the TUI-hosted Bridge runs, Screen open or not, for the
// process lifetime — opening the Screen after a failure still shows what happened.
export const createRingLog = (cap = LOG_CAP) => {
  const lines: string[] = [];
  const subs = new Set<() => void>();
  return {
    push: (line: string) => {
      lines.push(line);
      if (lines.length > cap) lines.splice(0, lines.length - cap);
      for (const f of subs) f();
    },
    lines: (): readonly string[] => lines,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
};
