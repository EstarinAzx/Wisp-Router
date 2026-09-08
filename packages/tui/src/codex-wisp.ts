#!/usr/bin/env bun
// Native Codex owns model selection, tools, policy and session storage. This launcher only
// overlays the local Responses transport; it never writes either application's stores.
import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { createConnection } from 'net';
import { constants } from 'os';
import { delimiter, join } from 'path';
import { DEFAULT_BRIDGE_PORT, WispHome } from '@wisp/core';

// This entry and the compiled dispatcher run on Bun. Use its native TOML parser rather than
// approximating inline tables (quoted/escaped search keys must be checked too).
const { TOML } = require('bun') as { TOML: { parse: (text: string) => Record<string, unknown> } };
const providerError = 'codex-wisp does not accept profiles or provider overrides. Use ordinary Codex for those options.';
const searchError = 'codex-wisp does not support hosted web search. Remove search-enabling options; client tool search remains available.';
const searchKeys = new Set(['web_search', 'web_search_request', 'web_search_cached']);

const checkConfig = (override: string): void => {
  const split = override.indexOf('=');
  if (split < 1) throw new Error('codex-wisp requires config overrides in key=value form.');
  // Codex splits the key on dots; only the VALUE uses TOML syntax.
  const key = override.slice(0, split).trim();
  const parts = key.split('.');
  if (['model_provider', 'model_providers', 'profile', 'profiles', 'oss_provider'].includes(parts[0])) {
    throw new Error(providerError);
  }
  if (parts[0] !== 'web_search' && parts[0] !== 'features' && parts[0] !== 'tools') return;
  let value: unknown = override.slice(split + 1).trim();
  try { value = TOML.parse(`value=${value}`).value; } catch { /* Codex also falls back to a literal string. */ }
  if (parts[0] === 'web_search') {
    if (parts.length !== 1 || value !== 'disabled') throw new Error(searchError);
  } else if (parts.length === 1) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(searchError);
    for (const [name, enabled] of Object.entries(value)) {
      if (searchKeys.has(name) && enabled !== false) throw new Error(searchError);
    }
  } else if (searchKeys.has(parts[1]) && (parts.length !== 2 || value !== false)) {
    throw new Error(searchError);
  }
};

export const validateCodexArgs = (args: readonly string[]): void => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') break;
    if (/^--(?:profile|oss|local-provider|remote|remote-auth-token-env)(?:=|$)/.test(arg) || /^-p/.test(arg)) throw new Error(providerError);
    if (/^--search(?:=|$)/.test(arg)) throw new Error(searchError);
    if (arg === '--enable' || arg.startsWith('--enable=')) {
      const name = arg === '--enable' ? args[++i] : arg.slice('--enable='.length);
      if (searchKeys.has(name)) throw new Error(searchError);
    } else if (arg === '-c' || arg === '--config') {
      checkConfig(args[++i] ?? '');
    } else if (arg.startsWith('--config=')) {
      checkConfig(arg.slice('--config='.length));
    } else if (/^-c./.test(arg)) {
      checkConfig(arg.slice(arg[2] === '=' ? 3 : 2));
    }
  }
};

export const buildCodexLaunch = (
  port: number, secret: string, args: readonly string[], inherited: NodeJS.ProcessEnv = process.env,
): { args: string[]; env: NodeJS.ProcessEnv } => {
  validateCodexArgs(args);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Wisp Bridge port; use an integer from 1 to 65535.');
  if (!secret.trim()) throw new Error('No Bridge secret found in Wisp home — start the Bridge first: run "wisp serve".');
  const bypass = (value?: string): string => [value, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(',');
  const env = { ...inherited };
  if (process.platform === 'win32') {
    for (const key of Object.keys(env)) if (key.toUpperCase() === 'WISP_CODEX_BRIDGE_SECRET') delete env[key];
  }
  return {
    args: [
      '-c', 'model_provider="wisp_local"',
      // One replacement table removes inherited headers, query params and alternate credentials.
      '-c', `model_providers.wisp_local={name="Wisp local Responses bridge",base_url="http://127.0.0.1:${port}/v1",wire_api="responses",env_key="WISP_CODEX_BRIDGE_SECRET",requires_openai_auth=false,supports_websockets=false}`,
      '-c', 'web_search="disabled"',
      ...args,
    ],
    env: { ...env, WISP_CODEX_BRIDGE_SECRET: secret.trim(), NO_PROXY: bypass(inherited.NO_PROXY), no_proxy: bypass(inherited.no_proxy) },
  };
};

// Any HTTP status, including 401, proves liveness. Bun's node:http can honor environment proxies;
// a numeric TCP socket cannot. Read only the status line, never follow Location, send no credential.
export const probeCodexBridge = (port: number): Promise<boolean> => new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port });
  const done = (up: boolean) => { clearTimeout(timer); socket.destroy(); resolve(up); };
  const timer = setTimeout(() => done(false), 2000);
  let status = '';
  socket.once('connect', () => socket.write(`GET /v1/models HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
  socket.on('data', chunk => {
    status += chunk.toString('ascii');
    if (status.includes('\r\n')) done(/^HTTP\/1\.[01] [1-5]\d{2}(?: |\r\n)/.test(status));
    else if (status.length > 1024) done(false);
  });
  socket.once('error', () => done(false));
  socket.once('end', () => done(false));
});

export const resolveCodex = (env: NodeJS.ProcessEnv = process.env): { file: string; args: string[] } => {
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean).map(dir => dir.replace(/^"(.*)"$/, '$1'));
  const nativeName = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  for (const dir of dirs) {
    const native = join(dir, nativeName);
    if (existsSync(native)) return { file: native, args: [] };
    for (const entry of [join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), join(dir, '..', '@openai', 'codex', 'bin', 'codex.js')]) {
      if (!existsSync(entry)) continue;
      const nodeDir = [dir, ...dirs].find(candidate => existsSync(join(candidate, nodeName)));
      if (!nodeDir) throw new Error('Could not start Codex: its npm installation needs Node.js on PATH.');
      return { file: join(nodeDir, nodeName), args: [entry] };
    }
  }
  throw new Error('Could not find Codex. Install the native Codex executable or @openai/codex with Node.js on PATH. Shell-only shims are not supported.');
};

export const runCodexWisp = async (args: string[] = process.argv.slice(2)): Promise<number> => {
  try {
    // Reject dangerous arguments even when the Bridge has not been started yet.
    validateCodexArgs(args);
    const home = new WispHome();
    const port = home.readConfig().bridge?.port ?? DEFAULT_BRIDGE_PORT;
    const launch = buildCodexLaunch(port, home.readAuth().bridgeSecret ?? '', args);
    if (!(await probeCodexBridge(port))) throw new Error(`Bridge not reachable at http://127.0.0.1:${port} — start it first: run "wisp serve".`);
    const codex = resolveCodex(launch.env);
    console.error('codex-wisp: Hosted web search is unavailable; client tool search remains available.');
    return await new Promise<number>(resolve => {
      const failed = () => {
        console.error('Could not start Codex. Check that its executable and Node.js (for npm installs) are runnable.');
        resolve(1);
      };
      let child: ChildProcess;
      try { child = spawn(codex.file, [...codex.args, ...launch.args], { stdio: 'inherit', env: launch.env, shell: false }); }
      catch { failed(); return; }
      const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
      const handlers = signals.map(signal => () => { if (!child.killed) child.kill(signal); });
      signals.forEach((signal, i) => process.on(signal, handlers[i]));
      const cleanup = () => signals.forEach((signal, i) => process.removeListener(signal, handlers[i]));
      child.once('error', () => {
        cleanup();
        failed();
      });
      child.once('exit', (code, signal) => {
        cleanup();
        if (signal) {
          // POSIX callers observe the child's signal, not a synthetic successful exit.
          if (process.platform !== 'win32') process.kill(process.pid, signal);
          resolve(128 + (constants.signals[signal] ?? 1));
        } else resolve(code ?? 1);
      });
    });
  } catch (err) {
    // Our validation messages contain no argument values, environment values or credentials.
    console.error(err instanceof Error ? err.message : 'Could not start Codex.');
    return 1;
  }
};

if ((import.meta as ImportMeta & { main?: boolean }).main) process.exitCode = await runCodexWisp();
