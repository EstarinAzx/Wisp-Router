import { home } from './store';

// Shared config is read live by both Bridge hosts; this command never starts a client or signs in.
export const runAntigravityCompat = (args: string[]): number => {
  const mode = args[0] ?? 'status';
  if (args.length > 1 || !['on', 'off', 'status'].includes(mode)) {
    console.error('Usage: wisp antigravity-compat on|off|status');
    return 1;
  }
  const cfg = home.readConfig();
  const enabled = mode === 'status' ? cfg.bridge?.antigravityClientFallback === true : mode === 'on';
  if (mode !== 'status') home.writeConfig({ bridge: { ...cfg.bridge, antigravityClientFallback: enabled } });
  console.log(`Antigravity client fallback: ${enabled ? 'on' : 'off'}`);
  if (enabled) console.log('Messages clients such as Claude Code must retry without positioned system messages. Fixed system instructions remain; later reminders become user context and some feature-specific reminders may be omitted. Cache benefit depends on the workload.');
  console.log('Start a new Claude conversation after changing this setting; client fallback can remain active until /clear. Desktop and Responses behavior is unchanged.');
  return 0;
};
