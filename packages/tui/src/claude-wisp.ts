#!/usr/bin/env bun
// ---------------- claude-wisp.ts — launch Claude Code pre-wired to the Bridge ---------------- //

/*
 * Depends on:
 *   - node child_process / fs / path: spawn `claude`, resolve its Windows shim.
 *   - @wisp/core: buildClaudeLaunch (the pure env-trio + argv contract), DEFAULT_BRIDGE_PORT.
 *   - ./store: the shared ~/.wisp handle.
 *
 * Data shapes: none of its own — ClaudeLaunch comes from core.
 *
 * A launcher, not a manager (#64): env lands on the CHILD only, argv passes through verbatim, the
 * exit code mirrors the child's. The Bridge must already be up — this never auto-starts one.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, delimiter } from 'path';
import { DEFAULT_BRIDGE_PORT, buildClaudeLaunch } from '@wisp/core';
import { home } from './store';

// ----------------------------- Store reads ----------------------------- //

// Same port rule as the hosts (bridge.ts / extension.ts) — duplicated as one expression rather than
// importing tui/bridge.ts, which would drag openai + the whole engine into every claude launch.
const port = home.readConfig().bridge?.port ?? DEFAULT_BRIDGE_PORT;
const address = `http://127.0.0.1:${port}`;

// Read-only: a host ensures the secret exists when it starts, so "no secret on disk" means no Bridge
// has ever run from this ~/.wisp — writing one here would mask that signal.
const secret = home.readAuth().bridgeSecret?.trim() ?? '';

// ----------------------------- Bridge probe ----------------------------- //

// Any HTTP response proves a live listener — even a 401 means the Bridge is up. Only a refused /
// timed-out connection is "down". Never auto-start: two hosts on the shared port is the #63 loud-fail.
const bridgeUp = async (): Promise<boolean> => {
  try {
    await fetch(`${address}/v1/models`, {
      headers: secret ? { 'x-api-key': secret } : {},
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
};

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

// ponytail: quote-if-needed with doubled inner quotes covers spaces + quotes through the cmd.exe hop;
// exotic cmd metacharacters (^ % !) inside args may still misparse via an npm shim — the native
// claude.exe path is fully verbatim. Upgrade to cross-spawn-style escaping if that ever bites.
const quoteForCmd = (a: string): string => (/[\s"]/.test(a) || a === '' ? `"${a.replace(/"/g, '""')}"` : a);

// ----------------------------- Launch ----------------------------- //

const run = async (): Promise<void> => {
  if (!secret) {
    console.error('No Bridge secret found in Wisp home — start the Bridge first: run "wisp serve" (or /bridge in the TUI).');
    process.exit(1);
  }
  if (!(await bridgeUp())) {
    console.error(`Bridge not reachable at ${address} — start it first: run "wisp serve" (or /bridge in the TUI).`);
    process.exit(1);
  }

  const launch = buildClaudeLaunch(port, secret, process.argv.slice(2));
  const env = { ...process.env, ...launch.env };
  const claude = resolveClaude();

  // .cmd shims can only run through cmd.exe: one hand-quoted line, verbatim so node doesn't re-quote.
  const child = claude.viaCmd
    ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[quoteForCmd(claude.file), ...launch.args.map(quoteForCmd)].join(' ')}"`],
        { stdio: 'inherit', env, windowsVerbatimArguments: true })
    : spawn(claude.file, launch.args, { stdio: 'inherit', env });

  child.on('error', (err) => {
    console.error(`Could not start claude: ${err.message} — is Claude Code installed and on PATH?`);
    process.exit(1);
  });

  // Ctrl+C belongs to the child (Claude Code handles its own); the parent just waits and mirrors.
  process.on('SIGINT', () => {});
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('exit', (code) => process.exit(code ?? 1));
};

await run();
