import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Separate processes keep the real store/module singletons and global fetch isolated from other tests.
const run = (script: string, timeout = 8_000) => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-test-commands-'));
  writeFileSync(join(dir, 'auth.json'), JSON.stringify({ codex: {}, antigravity: {
    accessToken: 'synthetic-antigravity', projectId: 'example-project-1',
  } }));
  try {
    const result = Bun.spawnSync([process.execPath, '--eval', `
      import assert from 'node:assert/strict';
      import { createElement, act } from 'react';
      import { testRender } from '@opentui/react/test-utils';
      globalThis.fetch = async () => { throw Error('unexpected network'); };
      ${script}
    `], { cwd: join(import.meta.dir, '..'), env: { ...process.env, WISP_HOME: dir, CODEX_HOME: dir }, timeout });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

const appHarness = `
  const { home } = await import('./src/store');
  const { App } = await import('./src/app');
  const ui = await testRender(createElement(App), { width: 100, height: 24 });
  const key = async name => {
    await act(async () => ui.mockInput.pressKeys([name], name === 'ESCAPE' ? 50 : 0));
    await ui.renderOnce();
  };
  const command = async text => { await act(async () => ui.mockInput.typeText(text)); await key('RETURN'); };
  await ui.renderOnce();
`;

test('real App /key xai directs to OAuth without writing a misleading key', () => run(`
  ${appHarness}
  const before = home.readAuth();
  try {
    await command('/key xai');
    assert(ui.captureCharFrame().includes('/signin xai'), ui.captureCharFrame());
    assert(!ui.captureCharFrame().includes('API key'), ui.captureCharFrame());
    await command('synthetic-unused-key');
    assert.deepEqual(home.readAuth(), before);
    assert.equal(home.readAuth().keys?.xai, undefined);
  } finally { await act(async () => ui.renderer.destroy()); }
`));

test('real App tests Antigravity provider and alias through its authenticated stream client', () => run(`
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    assert.equal(String(url), 'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer synthetic-antigravity');
    const body = JSON.parse(init.body);
    assert.equal(body.project, 'example-project-1');
    assert.equal(body.model, ['gemini-3.1-pro-low', 'gemini-3.8-flash-tiered'][requests.length - 1]);
    assert.equal(body.request.contents[0].parts[0].text, 'Reply with one short sentence confirming you can hear me.');
    return new Response('data: {"response":{"candidates":[{"content":{"role":"model","parts":[{"text":"ANTIGRAVITY_OK"}]},"finishReason":"STOP"}]}}' + String.fromCharCode(13, 10, 13, 10), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  ${appHarness}
  home.writeConfig({ models: { antigravity: 'gemini-3.1-pro-low' }, routing: { families: {}, aliases: [
    { name: 'ag-check', target: { providerId: 'antigravity', model: 'gemini-3.8-flash-tiered' } },
  ] } });
  try {
    for (const target of ['antigravity', 'ag-check']) {
      await command('/test ' + target);
      assert(ui.captureCharFrame().includes('ANTIGRAVITY_OK'), ui.captureCharFrame());
      assert(ui.captureCharFrame().includes('Done'), ui.captureCharFrame());
      await key('ESCAPE');
    }
    assert.equal(requests.length, 2);
  } finally { await act(async () => ui.renderer.destroy()); }
`));

test('real App refuses Antigravity Argon provider and alias tests before any transport', () => run(`
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw Error('unsupported test reached transport'); };
  ${appHarness}
  // Refusal must precede credential refresh/project hydration, which can also use transport.
  home.writeAuth({ antigravity: { accessToken: 'expired-fixture', refreshToken: 'fixture-refresh', expiresAt: 0 } });
  try {
    for (const tier of ['low', 'medium', 'high']) {
      home.writeConfig({ models: { antigravity: 'gemini-4-argon-' + tier }, routing: { families: {}, aliases: [
        { name: 'argon-check', target: { providerId: 'antigravity', model: 'gemini-4-argon-' + tier } },
      ] } });
      for (const target of ['antigravity', 'argon-check']) {
        await command('/test ' + target);
        assert.match(ui.captureCharFrame(), /Argon.*Responses|Responses.*Argon/);
        assert.equal(requests, 0);
        await key('ESCAPE');
      }
    }
  } finally { await act(async () => ui.renderer.destroy()); }
`));

test('stalled optional catalog body falls back for Claude and permits keyed discovery', () => run(`
  const { PROVIDERS } = await import('@wisp/core');
  let catalogSignal;
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    if (String(url) === 'https://models.dev/api.json') {
      catalogSignal = init.signal;
      return { ok: true, json: () => new Promise(() => {}) };
    }
    assert.equal(String(url), 'https://api.groq.com/openai/v1/models');
    return Response.json({ data: [{ id: 'fixture-groq-model' }] });
  };
  const { fetchModelList } = await import('./src/modelFetch');
  const start = performance.now();
  const [claude, groq] = await Promise.all(['anthropic', 'groq'].map(id => fetchModelList(PROVIDERS.find(p => p.id === id))));
  assert(claude.some(id => id.includes('claude')));
  assert.deepEqual(groq, ['fixture-groq-model']);
  assert(performance.now() - start < 5_500);
  assert.equal(catalogSignal.aborted, true);
  assert.deepEqual(urls, ['https://models.dev/api.json', 'https://api.groq.com/openai/v1/models']);
`, 7_000), 10_000);
