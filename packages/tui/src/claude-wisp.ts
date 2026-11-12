#!/usr/bin/env bun
// Launch the installed Claude Code with a child-only, target-bound context budget.
import { spawn, execFile } from 'child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join, delimiter } from 'path';
import { tmpdir } from 'os';
import { request } from 'http';
import { DEFAULT_BRIDGE_PORT, WispHome, readClaudeContext, type ClaudeContextProfile } from '@wisp/core';
import { parseClaudeContextArgs, buildClaudeContextLaunch, supportsClaudeContext, resolveClaudeContextSelection } from './claudeContextLaunch';

// ----------------------------- Windows shim resolution ----------------------------- //

// Find the real `claude` behind the name. POSIX spawn resolves PATH itself; on Windows a bare name
// misses the npm `.cmd` shim, and node/Bun refuse to spawn `.cmd` without a shell (BatBadBut). So:
// prefer `claude.exe` (native installer — direct, fully verbatim spawn), else fall back to the shim.
const resolveClaude = (): { file: string; viaCmd: boolean } => {
  if (process.platform !== 'win32') return { file: 'claude', viaCmd: false };
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, 'claude.exe'))) return { file: join(dir, 'claude.exe'), viaCmd: false };
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of ['.cmd', '.bat']) {
      if (existsSync(join(dir, `claude${ext}`))) return { file: join(dir, `claude${ext}`), viaCmd: true };
    }
  }
  // Nothing found — hand the bare name to spawn so its ENOENT lands in the one error handler below.
  return { file: 'claude', viaCmd: false };
};

// ponytail: quote-if-needed covers spaces, quotes, and cmd metachars (& | < > ^) through the cmd.exe
// hop — inner quotes doubled, trailing backslashes doubled so a closing `\"` isn't read as an escaped
// quote. Remaining ceiling: %VAR% expands even inside quotes via an npm shim — the native claude.exe
// path is fully verbatim. Upgrade to cross-spawn-style escaping if that ever bites.
const quoteForCmd = (a: string): string =>
  /[\s"&|<>^]/.test(a) || a === ''
    ? `"${a.replace(/"/g, '""').replace(/(\\+)$/, '$1$1')}"`
    : a;

// The profile request stays on numeric loopback: no proxy, redirect or provider credential.
const requestContext = (port: number, secret: string, model?: string): Promise<{ profile: ClaudeContextProfile; token: string }> =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(model === undefined ? {} : { model });
    const req = request({ host: '127.0.0.1', port, path: '/claude-code/context', method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 65536) req.destroy(new Error('Oversized Bridge context response.')); });
      res.on('error', reject);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error(res.statusCode === 404
            ? 'The running Wisp Bridge does not support context profiles. Update and restart the Bridge first.'
            : `Bridge could not resolve this context profile (HTTP ${res.statusCode}). Check the selected Wisp route.`);
          const value = JSON.parse(body);
          const profile = readClaudeContext(value.token, secret);
          resolve({ profile, token: value.token });
        } catch (error) { reject(error); }
      });
    });
    const timeout = setTimeout(() => req.destroy(new Error('Bridge context lookup timed out.')), 6500);
    req.on('close', () => clearTimeout(timeout));
    req.on('error', error => reject((error as NodeJS.ErrnoException).code === 'ECONNREFUSED'
      ? new Error(`Bridge not reachable at http://127.0.0.1:${port} — start it first with wisp serve or /bridge.`) : error));
    req.end(data);
  });

const invocation = (claude: ReturnType<typeof resolveClaude>, args: string[]) => claude.viaCmd
  ? { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${[quoteForCmd(claude.file), ...args.map(quoteForCmd)].join(' ')}"`], windowsVerbatimArguments: true }
  : { file: claude.file, args, windowsVerbatimArguments: false };

const checkVersion = (claude: ReturnType<typeof resolveClaude>): Promise<void> => new Promise((resolve, reject) => {
  const command = invocation(claude, ['--version']);
  execFile(command.file, command.args, { timeout: 4000, maxBuffer: 4096, windowsHide: true,
    windowsVerbatimArguments: command.windowsVerbatimArguments }, (error, stdout) => {
    if (error || !supportsClaudeContext(stdout)) reject(new Error('Exact context budgets require Claude Code 2.1.322 or newer on PATH. Update Claude Code separately, then retry.'));
    else resolve();
  });
});

export const runClaudeWisp = async (args: string[] = process.argv.slice(2)): Promise<number> => {
  let temporary: string | undefined;
  try {
    const parsed = parseClaudeContextArgs(args);
    const home = new WispHome();
    const port = home.readConfig().bridge?.port ?? DEFAULT_BRIDGE_PORT;
    const secret = home.readAuth().bridgeSecret?.trim() ?? '';
    if (!secret) throw new Error('No Bridge secret found in Wisp home ? start the Bridge first with wisp serve or /bridge.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Wisp Bridge port.');
    const claude = resolveClaude();
    const { profile, token } = await requestContext(port, secret, resolveClaudeContextSelection(parsed.model, process.env, secret));
    await checkVersion(claude);
    const launch = buildClaudeContextLaunch(port, secret, profile, token, parsed, process.env);
    temporary = mkdtempSync(join(tmpdir(), 'wisp-claude-context-'));
    const settings = join(temporary, 'settings.json');
    // User temp ACLs protect Windows; owner-only permissions protect POSIX, matching Wisp's store policy.
    writeFileSync(settings, JSON.stringify(launch.settings), { encoding: 'utf8', mode: 0o600 });
    const command = invocation(claude, ['--settings', settings, ...launch.args]);
    console.error(`claude-wisp: ${profile.route} ? ${profile.target.model}; ${profile.contextWindow} context tokens (${profile.source}).`);
    if (profile.source === 'fallback') console.error('Target capacity unavailable: using a conservative 128000-token budget.');
    console.error('To change targets, exit and relaunch with --resume <session> --model <alias>. Other-target subagents/fallbacks are refused.');
    return await new Promise<number>(resolve => {
      const child = spawn(command.file, command.args, { stdio: 'inherit', env: launch.env, windowsVerbatimArguments: command.windowsVerbatimArguments });
      const interrupt = () => {};
      const terminate = () => child.kill('SIGTERM');
      process.on('SIGINT', interrupt);
      process.on('SIGTERM', terminate);
      const finish = (code: number) => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); resolve(code); };
      child.once('error', () => { console.error('Could not start the installed Claude Code.'); finish(1); });
      child.once('exit', code => finish(code ?? 1));
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not prepare Claude Code context.');
    return 1;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
};

if (import.meta.main) process.exitCode = await runClaudeWisp();
