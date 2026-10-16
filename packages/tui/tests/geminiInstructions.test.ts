import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WispHome, effortOptionsFor, type Provider } from '@wisp/core';
import { geminiInstructionsResult } from '../src/geminiInstructions';
import { fetchModelList } from '../src/modelFetch';
import { bearerFor } from '../src/store';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
test('Gemini status is read-only, strict by default, and independent of Antigravity consent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-mode-')); dirs.push(dir);
  const h = new WispHome(dir); h.writeConfig({ bridge: { antigravityClientFallback: true, port: 1234 } });
  const before = readFileSync(join(dir, 'config.json'), 'utf8');
  expect(geminiInstructionsResult(['status'], h).lines.join('\n')).toContain('strict');
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(before);
  const result = geminiInstructionsResult(['prepend-leading-developer-v1'], h);
  expect(result.exitCode).toBe(0);
  expect(result.lines.join('\n')).toContain('Their separate priority levels are not preserved. Positioned instructions remain unsupported.');
  expect(h.readConfig().bridge).toEqual({ antigravityClientFallback: true, port: 1234, geminiApiInstructions: 'prepend-leading-developer-v1' });
  expect(geminiInstructionsResult(['strict'], h).exitCode).toBe(0);
  const strict = readFileSync(join(dir, 'config.json'), 'utf8');
  for (const args of [['on'], ['status', 'strict'], ['invalid']]) expect(geminiInstructionsResult(args, h).exitCode).toBe(1);
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(strict);
});

test('Gemini fixed models and effort are local, while generic bearer resolution refuses', async () => {
  const p: Provider = { id: 'gemini-api', label: 'Research fixture', kind: 'gemini-interactions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-4-argon', apiKeyEnv: '' };
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw Error('network forbidden'); }) as typeof fetch;
  try {
    expect(await fetchModelList(p)).toEqual(['gemini-4-argon']);
    expect(effortOptionsFor(p)).toEqual(['low', 'medium', 'high']);
    await expect(bearerFor(p)).rejects.toThrow(/Gemini/);
  } finally { globalThis.fetch = original; }
});

test('VS Code chat does not list or resolve credentials for Gemini', () => {
  const result = Bun.spawnSync([process.execPath, '--eval', `
    import { mock } from 'bun:test'; import assert from 'node:assert/strict';
    let provider, keys = 0;
    mock.module('vscode', () => ({ lm: { registerLanguageModelChatProvider: (_id, p) => { provider = p; return {dispose(){}}; } } }));
    globalThis.fetch = async () => Response.json({});
    const { registerWispChatProvider } = await import('../../vscode/src/chatProvider');
    registerWispChatProvider({providers: [{id:'gemini-api',label:'Research fixture',kind:'gemini-interactions',baseUrl:'https://generativelanguage.googleapis.com/v1beta',defaultModel:'gemini-4-argon',apiKeyEnv:''}], modelMap: () => ({}), customBaseUrl: () => '',
      keyFor: async () => { keys++; throw Error('generic key'); }, clientFor: async () => { throw Error('generic client'); }, effort: () => 'medium', log(){} });
    assert.deepEqual(await provider.provideLanguageModelChatInformation(), []);
    await assert.rejects(provider.provideLanguageModelChatResponse({id:'gemini-api'}, [], {}, {}, {}), /Gemini/);
    assert.equal(keys, 0);
  `], { cwd: join(import.meta.dir, '../src'), timeout: 7000 });
  expect(result.stderr.toString()).toBe(''); expect(result.exitCode).toBe(0);
});

test('two fresh processes compete for the absent Gemini lifetime and only one succeeds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-creators-')); dirs.push(dir);
  const script = `import { WispHome } from '@wisp/core';
    const home = new WispHome(process.env.WISP_HOME);
    try { home.saveGeminiApiKey('synthetic', null); console.log('saved'); }
    catch (e) { console.log('refused'); }
  `;
  const children = [0, 1].map(() => Bun.spawn([process.execPath, '--eval', script], {
    cwd: join(import.meta.dir, '../src'), env: { ...process.env, WISP_HOME: dir }, stdout: 'pipe', stderr: 'pipe',
  }));
  const outcomes = await Promise.all(children.map(async child => ({ exit: await child.exited, out: await new Response(child.stdout).text(), err: await new Response(child.stderr).text() })));
  expect(outcomes.map(r => r.exit)).toEqual([0, 0]); expect(outcomes.map(r => r.err)).toEqual(['', '']);
  expect(outcomes.map(r => r.out.trim()).sort()).toEqual(['refused', 'saved']);
  expect(new WispHome(dir).geminiReplayContext()).toBeDefined();
});
