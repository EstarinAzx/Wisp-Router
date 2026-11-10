import type { WispHome } from '@wisp/core';
import { home } from './store';

// Shared config is read live by both Bridge hosts; this command never starts a client or signs in.
export const antigravityCompatResult = (args: string[], store: Pick<WispHome, 'readConfig' | 'writeConfig'> = home): { exitCode: number; lines: string[] } => {
  const mode = args[0] ?? 'status';
  if (args.length > 1 || !['on', 'off', 'status'].includes(mode)) {
    return { exitCode: 1, lines: ['Usage: wisp antigravity-compat [on|off|status]', 'TUI: /antigravity-compat [on|off|status]'] };
  }
  try {
    const cfg = store.readConfig();
    const enabled = mode === 'status' ? cfg.bridge?.antigravityClientFallback === true : mode === 'on';
    if (mode !== 'status') store.writeConfig({ bridge: { ...cfg.bridge, antigravityClientFallback: enabled } });
    const lines = [`Antigravity client fallback: ${enabled ? 'on' : 'off'}`];
    if (enabled) lines.push('Messages clients such as Claude Code must retry without positioned system messages. Fixed system instructions remain; later reminders become user context and some feature-specific reminders may be omitted. Cache benefit depends on the workload.');
    lines.push('Start a new Claude conversation after changing this setting; client fallback can remain active until /clear. Desktop and Responses behavior is unchanged.');
    return { exitCode: 0, lines };
  } catch (error) {
    return { exitCode: 1, lines: [`Could not update Antigravity compatibility: ${error instanceof Error ? error.message : String(error)}`] };
  }
};

export const runAntigravityCompat = (args: string[]): number => {
  const result = antigravityCompatResult(args);
  for (const line of result.lines) (result.exitCode ? console.error : console.log)(line);
  return result.exitCode;
};
