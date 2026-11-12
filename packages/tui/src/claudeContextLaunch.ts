// Child-only Claude context configuration. Native permissions and unrelated options remain native.
import { readFileSync } from 'fs';
import { buildClaudeLaunch, CLAUDE_CONTEXT_HEADER, CLAUDE_CONTEXT_PREFIX, readClaudeContext, type ClaudeContextProfile } from '@wisp/core';

type Settings = Record<string, any>;
export type ClaudeContextArgs = { model?: string; args: string[]; settings: Settings };
const object = (value: unknown): value is Settings => !!value && typeof value === 'object' && !Array.isArray(value);
const values = new Set(['--system-prompt', '--system-prompt-file', '--append-system-prompt', '--append-system-prompt-file',
  '--permission-mode', '--permission-prompt-tool', '--output-format', '--input-format', '--json-schema', '--effort',
  '--agent', '--agents', '--session-id', '--max-turns', '--max-budget-usd', '--mcp-config', '--tools', '--allowedTools',
  '--allowed-tools', '--disallowedTools', '--disallowed-tools', '--plugin-dir', '--plugin-url', '--add-dir', '--setting-sources',
  '--betas', '--debug-file', '--name', '-n', '--remote-control-session-name-prefix']);

export const parseClaudeContextArgs = (args: readonly string[]): ClaudeContextArgs => {
  const result: ClaudeContextArgs = { args: [], settings: {} };
  let resume = false, settingsSeen = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { result.args.push(...args.slice(i)); break; }
    if (arg === '--model' || arg.startsWith('--model=')) {
      const model = arg === '--model' ? args[++i] : arg.slice(8);
      if (!model?.trim() || model.startsWith('--') || result.model !== undefined) throw new Error('Supply one --model <Wisp alias or Provider>.');
      result.model = model; continue;
    }
    if (arg === '--settings' || arg.startsWith('--settings=')) {
      const value = arg === '--settings' ? args[++i] : arg.slice(11);
      if (!value || settingsSeen) throw new Error('Supply at most one --settings JSON object or file.');
      settingsSeen = true;
      try { result.settings = JSON.parse(value.trimStart().startsWith('{') ? value : readFileSync(value, 'utf8')); }
      catch { throw new Error('Could not read --settings as a JSON object; no settings were changed.'); }
      if (!object(result.settings)) throw new Error('--settings must contain a JSON object.');
      continue;
    }
    if (/^--fallback-model(?:=|$)/.test(arg)) throw new Error('A fallback needs its own context budget. Relaunch claude-wisp with --model instead.');
    if (/^(?:--resume|--continue)(?:=|$)/.test(arg) || arg === '-r' || arg === '-c') resume = true;
    result.args.push(arg);
    if (values.has(arg)) {
      if (args[i + 1] === undefined) throw new Error(`Missing value for ${arg}.`);
      result.args.push(args[++i]);
    }
  }
  if (resume && !result.model) throw new Error('Resume with an explicit --model <Wisp alias or Provider> so the context budget matches the selected target.');
  return result;
};

export const supportsClaudeContext = (version: string): boolean => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(version.trim());
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 322)));
};

export const resolveClaudeContextSelection = (model: string | undefined, env: NodeJS.ProcessEnv, secret: string): string | undefined => {
  if (!model?.startsWith(CLAUDE_CONTEXT_PREFIX)) return model;
  const line = (env.ANTHROPIC_CUSTOM_HEADERS ?? '').split(/\r?\n/).find(value => value.slice(0, value.indexOf(':')).trim().toLowerCase() === CLAUDE_CONTEXT_HEADER);
  if (line) {
    const inherited = readClaudeContext(line.slice(line.indexOf(':') + 1).trim(), secret);
    if (inherited.id === model) return inherited.route;
  }
  throw new Error('This generated model belongs to another launch. Use --model with the original Wisp alias.');
};

export const buildClaudeContextLaunch = (port: number, secret: string, profile: ClaudeContextProfile, token: string,
  parsed: ClaudeContextArgs, inherited: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; args: string[]; settings: Settings } => {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !secret.trim()) throw new Error('Invalid Bridge port or secret.');
  const verified = readClaudeContext(token, secret);
  if (JSON.stringify(verified) !== JSON.stringify(profile)) throw new Error('Claude context profile does not match its token.');
  const settings = { ...parsed.settings };
  if (settings.env !== undefined && !object(settings.env)) throw new Error('Settings env must be an object.');
  const explicitEnv = settings.env ?? {};
  const combinedEnv = Object.fromEntries(Object.entries({ ...inherited, ...explicitEnv }).map(([key, value]) => [key.toUpperCase(), value]));
  for (const key of ['DISABLE_COMPACT', 'DISABLE_AUTO_COMPACT', 'CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT']) {
    const value = combinedEnv[key];
    if (value !== undefined && !['0', 'false', ''].includes(String(value).toLowerCase())) throw new Error(`Exact context mode conflicts with ${key}; leave automatic compaction enabled.`);
  }
  for (const [key, value] of Object.entries(combinedEnv)) {
    if ((key.startsWith('CLAUDE_CODE_USE_') || key === 'ANTHROPIC_UNIX_SOCKET') && value && !['0', 'false'].includes(String(value).toLowerCase())) {
      throw new Error(`Provider override ${key} conflicts with the Wisp Bridge.`);
    }
  }
  const base = buildClaudeLaunch(port, secret, []);
  const protectedEnv: Record<string, string> = { ...base.env, ANTHROPIC_AUTH_TOKEN: secret,
    ANTHROPIC_MODEL: profile.id, CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(profile.contextWindow), CLAUDE_CODE_DISABLE_1M_CONTEXT: '1',
    WISP_CLAUDE_CONTEXT_PROFILE: JSON.stringify(profile) };
  for (const [key, value] of Object.entries(explicitEnv)) {
    if (Object.hasOwn(protectedEnv, key.toUpperCase()) && String(value) !== protectedEnv[key.toUpperCase()]) throw new Error(`--settings env.${key} conflicts with the selected Wisp context profile.`);
  }
  const lines: string[] = [];
  for (const line of String(explicitEnv.ANTHROPIC_CUSTOM_HEADERS ?? inherited.ANTHROPIC_CUSTOM_HEADERS ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const split = line.indexOf(':');
    const key = line.slice(0, split).trim().toLowerCase();
    if (split <= 0 || ['authorization', 'x-api-key', 'host'].includes(key)) throw new Error('Custom headers conflict with Wisp transport authentication.');
    if (key === CLAUDE_CONTEXT_HEADER) continue; // A nested relaunch replaces only its parent's profile.
    lines.push(line);
  }
  protectedEnv.ANTHROPIC_CUSTOM_HEADERS = [...lines, `${CLAUDE_CONTEXT_HEADER}: ${token}`].join('\n');
  const bypass = (value?: string) => [value, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(',');
  const preserved = Object.fromEntries(Object.entries(inherited).filter(([key]) => !Object.hasOwn(protectedEnv, key.toUpperCase())));
  const env = { ...preserved, ...protectedEnv, NO_PROXY: bypass(inherited.NO_PROXY), no_proxy: bypass(inherited.no_proxy) };
  // Flag settings win over saved env without changing the user's files. The launcher writes this to a private temporary file.
  settings.env = { ...Object.fromEntries(Object.entries(explicitEnv).filter(([key]) => !Object.hasOwn(protectedEnv, key.toUpperCase()))), ...protectedEnv };
  settings.model = profile.id;
  settings.availableModels = [profile.id];
  settings.enforceAvailableModels = true;
  settings.modelPicker = { replaceBuiltInOptions: true, options: [{ model: profile.id, label: profile.route,
    description: `${profile.contextWindow} context tokens; change target by relaunching claude-wisp.` }] };
  return { env, args: ['--model', profile.id, ...parsed.args], settings };
};
