import { expect, test } from 'bun:test';
import { createClaudeContextProfile, signClaudeContext } from '@wisp/core';
import { parseClaudeContextArgs, buildClaudeContextLaunch, supportsClaudeContext, resolveClaudeContextSelection } from '../src/claudeContextLaunch';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join, dirname, resolve } from 'path';
import { createServer } from 'http';

const profile = (contextWindow = 500000) => createClaudeContextProfile('grok', {
  route: 'grok', target: { providerId: 'xai', model: 'grok-4.7' }, baseUrl: 'https://cli-chat-proxy.grok.com/v1',
}, { contextWindow, source: 'catalogue' });

test.each([128000, 400000, 500000, 1000000])('child-only context configuration uses %i without relaxing permissions', window => {
  const p = profile(window), token = signClaudeContext(p, 'secret');
  const inherited = { PATH: 'tools', ANTHROPIC_MODEL: 'old', ANTHROPIC_CUSTOM_HEADERS: 'X-Example: keep', PERMISSION_SENTINEL: 'unchanged' };
  const parsed = parseClaudeContextArgs(['--model', 'grok', '--permission-mode', 'default', '--settings', '{"permissions":{"deny":["Bash(rm *)"]}}', '--', 'literal --model text']);
  const launch = buildClaudeContextLaunch(1234, 'secret', p, token, parsed, inherited);
  expect(launch.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe(String(window));
  expect(launch.env.CLAUDE_CODE_DISABLE_1M_CONTEXT).toBe('1');
  expect(launch.env.ANTHROPIC_MODEL).toBe(p.id);
  expect(launch.env.ANTHROPIC_CUSTOM_HEADERS).toContain('X-Example: keep');
  expect(launch.env.ANTHROPIC_CUSTOM_HEADERS).toContain('x-wisp-claude-context: ' + token);
  expect(launch.env.PERMISSION_SENTINEL).toBe('unchanged');
  expect(JSON.parse(launch.env.WISP_CLAUDE_CONTEXT_PROFILE!)).toEqual(p);
  expect(launch.settings.permissions).toEqual({ deny: ['Bash(rm *)'] });
  expect(launch.settings.model).toBe(p.id);
  expect(launch.args).toEqual(['--model', p.id, '--permission-mode', 'default', '--', 'literal --model text']);
  expect(inherited.ANTHROPIC_MODEL).toBe('old');
});

test('resume requires explicit selection and preserves native resume options', () => {
  expect(() => parseClaudeContextArgs(['--resume', 'session-id'])).toThrow(/--model/);
  expect(() => parseClaudeContextArgs(['-c'])).toThrow(/--model/);
  expect(parseClaudeContextArgs(['--resume=session-id', '--model=grok', '--fork-session'])).toMatchObject({ model: 'grok', args: ['--resume=session-id', '--fork-session'] });
  expect(parseClaudeContextArgs(['--system-prompt', '--model', '--model', 'grok'])).toMatchObject({ model: 'grok', args: ['--system-prompt', '--model'] });
  expect(() => parseClaudeContextArgs(['--model'])).toThrow();
  expect(() => parseClaudeContextArgs(['--model', 'a', '--model', 'b'])).toThrow();
});

test('explicit transport and context conflicts are refused while ordinary settings survive', () => {
  const p = profile(), token = signClaudeContext(p, 'secret');
  for (const env of [{ ANTHROPIC_BASE_URL: 'https://other.example' }, { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1000000' }, { DISABLE_COMPACT: '1' }]) {
    expect(() => buildClaudeContextLaunch(1234, 'secret', p, token,
      parseClaudeContextArgs(['--settings', JSON.stringify({ env })]), {})).toThrow(/conflict|compaction/i);
  }
  expect(() => parseClaudeContextArgs(['--fallback-model', 'opus'])).toThrow(/relaunch|fallback/i);
  expect(() => buildClaudeContextLaunch(1234, 'secret', p, token, parseClaudeContextArgs([]), { ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer other' })).toThrow();
  expect(() => buildClaudeContextLaunch(1234, 'secret', p, 'tampered', parseClaudeContextArgs([]), {})).toThrow();
});

test('requires the qualified native client version without assuming every version string is valid', () => {
  expect(supportsClaudeContext('2.1.322 (Claude Code)')).toBe(true);
  expect(supportsClaudeContext('2.1.323 (Claude Code)')).toBe(true);
  expect(supportsClaudeContext('2.1.258 (Claude Code)')).toBe(false);
  expect(supportsClaudeContext('unknown')).toBe(false);
});

test('normalizes protected Windows environment names and refuses competing provider modes', () => {
  const p = profile(), token = signClaudeContext(p, 'secret');
  const launch = buildClaudeContextLaunch(1234, 'secret', p, token, parseClaudeContextArgs([]), { anthropic_model: 'old', anthropic_base_url: 'https://old.example' });
  expect(launch.env.anthropic_model).toBeUndefined();
  expect(launch.env.anthropic_base_url).toBeUndefined();
  expect(launch.env.ANTHROPIC_MODEL).toBe(p.id);
  expect(() => buildClaudeContextLaunch(1234, 'secret', p, token, parseClaudeContextArgs([]), { CLAUDE_CODE_USE_BEDROCK: '1' })).toThrow(/provider/i);
});

test('a nested launcher resolves its inherited generated identity back to the signed route', () => {
  const p = profile(), token = signClaudeContext(p, 'secret');
  expect(resolveClaudeContextSelection(p.id, { ANTHROPIC_CUSTOM_HEADERS: `x-wisp-claude-context: ${token}` }, 'secret')).toBe('grok');
  expect(resolveClaudeContextSelection('carbon', {}, 'secret')).toBe('carbon');
  expect(() => resolveClaudeContextSelection(p.id, {}, 'secret')).toThrow(/alias/i);
});

test.each([false, true])('launcher negotiates and cleans up through dispatcher=%s', async dispatched => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-claude-launch-'));
  const p = profile(), token = signClaudeContext(p, 'secret');
  const captured = join(dir, 'capture.json');
  const script = join(dir, 'fake.cjs');
  writeFileSync(script, `const fs=require('fs');const a=process.argv.slice(2);if(a[0]==='--version'){console.log('2.1.322 (Claude Code)');process.exit(0);}const pos=a.indexOf('--settings');const file=pos>=0?a[pos+1]:null;fs.writeFileSync(${JSON.stringify(captured)},JSON.stringify({args:a,window:process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS,settings:file?JSON.parse(fs.readFileSync(file,'utf8')):null,file}));process.exit(7);`);
  const node = Bun.which('node')!;
  if (process.platform === 'win32') writeFileSync(join(dir, 'claude.cmd'), `@echo off\r\n"${node}" "${script}" %*\r\n`);
  else writeFileSync(join(dir, 'claude'), `#!/bin/sh\nexec '${node}' '${script}' "$@"\n`, { mode: 0o700 });
  mkdirSync(join(dir, 'home'));
  writeFileSync(join(dir, 'home', 'auth.json'), JSON.stringify({ bridgeSecret: 'secret' }));
  let negotiated: unknown;
  const server = createServer((req, res) => {
    if (req.url !== '/claude-code/context') { res.writeHead(401); res.end(); return; }
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      negotiated = JSON.parse(body); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ profile: p, token }));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  writeFileSync(join(dir, 'home', 'config.json'), JSON.stringify({ bridge: { port } }));
  try {
    const entry = dispatched ? [resolve(import.meta.dir, '../src/index.tsx'), 'claude-wisp'] : [resolve(import.meta.dir, '../src/claude-wisp.ts')];
    const child = Bun.spawn([process.execPath, ...entry, '--model', 'grok', '-p', 'literal text'], {
      cwd: dir, env: { ...process.env, WISP_HOME: join(dir, 'home'), PATH: [dir, dirname(node), join(process.env.SystemRoot ?? 'C:/Windows', 'System32')].join(delimiter),
        ANTHROPIC_CUSTOM_HEADERS: '', DISABLE_COMPACT: '', DISABLE_AUTO_COMPACT: '', CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: '' }, stdout: 'pipe', stderr: 'pipe',
    });
    const error = await new Response(child.stderr).text();
    expect(await child.exited, error).toBe(7);
    const output = JSON.parse(readFileSync(captured, 'utf8'));
    expect(negotiated).toEqual({ model: 'grok' });
    expect(output.window).toBe('500000');
    expect(output.settings.model).toBe(p.id);
    expect(output.args.slice(-2)).toEqual(['-p', 'literal text']);
    expect(existsSync(output.file)).toBe(false);
  } finally {
    await new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); });
    rmSync(dir, { recursive: true, force: true });
  }
});
