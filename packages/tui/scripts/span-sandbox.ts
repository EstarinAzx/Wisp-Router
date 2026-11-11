import * as childProcess from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { mock } = require('bun:test');

// Install at the process seam before importing the App: fetch alone misses native discovery.
const blocked = (): never => { throw new Error('span-baseline: child process forbidden'); };
const execFile = (...args: unknown[]) => {
  const argv = args[1] as string[];
  if (argv.join(' ') !== 'debug models') return blocked();
  console.log('span sandbox: intercepted execFile (synthetic catalog)');
  const callback = args.at(-1) as (error: null, stdout: string) => void;
  callback(null, JSON.stringify({ models: [{ slug: 'span-codex', display_name: 'Span Codex', visibility: 'list' }] }));
  return {};
};
const safe = { ...childProcess, execFile, execFileSync: blocked, spawn: blocked, spawnSync: blocked, exec: blocked, execSync: blocked, fork: blocked };
mock.module('child_process', () => safe);
mock.module('node:child_process', () => safe);

export const sandbox = mkdtempSync(join(tmpdir(), 'wisp-span-'));
console.log(`span sandbox: ${sandbox}`);
for (const name of ['HOME', 'USERPROFILE', 'WISP_HOME', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'APPDATA', 'LOCALAPPDATA']) {
  process.env[name] = join(sandbox, name);
  mkdirSync(process.env[name]!, { recursive: true });
}
process.env.WISP_HOME = sandbox;
// Resolve only an inert placeholder; execFile above supplies the catalog without launching it.
process.env.PATH = sandbox;
process.env.Path = sandbox;
writeFileSync(join(sandbox, process.platform === 'win32' ? 'codex.exe' : 'codex'), 'synthetic placeholder');
