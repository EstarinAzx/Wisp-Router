import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Isolate the store singleton; credentials are stubbed before the routing command can use them.
const run = (script: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-config-mutations-'));
  try {
    const result = Bun.spawnSync([process.execPath, '--eval', `
      import assert from 'node:assert/strict';
      globalThis.fetch = async () => { throw Error('unexpected network'); };
      const { home, codexAuth } = await import('./src/store');
      const { WispHome } = await import('@wisp/core');
      const { runRoutingCli } = await import('./src/routingCli');
      const { runSnapshotCli } = await import('./src/snapshotCli');
      const sibling = new WispHome(process.env.WISP_HOME);
      ${script}
    `], { cwd: join(import.meta.dir, '..'), env: { ...process.env, WISP_HOME: dir, CODEX_HOME: dir }, timeout: 8_000 });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('a deferred routing edit refuses stale state instead of erasing a successful alias write', () => run(`
  home.writeConfig({ routing: { families: {}, aliases: [] } });
  let release;
  codexAuth.isSignedIn = () => new Promise(resolve => { release = resolve; });
  const first = runRoutingCli(['set', 'first', 'codex/first']);
  assert.equal(typeof release, 'function');
  sibling.writeConfig({ routing: { families: {}, aliases: [{ name: 'second', target: { providerId: 'codex', model: 'second' } }] } });
  release(true);
  await assert.rejects(first, /routing.*changed.*retry/i);
  assert.deepEqual(home.readConfig().routing.aliases.map(a => a.name), ['second']);
`));

test('a deferred routing edit preserves independent config changes and commits normally', () => run(`
  let release;
  codexAuth.isSignedIn = () => new Promise(resolve => { release = resolve; });
  const first = runRoutingCli(['set', 'opus', 'codex/fixture']);
  sibling.writeConfig({ effort: 'high', models: { groq: 'sibling' } });
  release(true);
  assert.equal(await first, 0);
  assert.deepEqual(home.readConfig(), { effort: 'high', models: { groq: 'sibling' }, routing: {
    families: { opus: { providerId: 'codex', model: 'fixture' } }, aliases: [],
  } });
`));

test('snapshot and revert preserve sibling routes, saved snapshots and preferences', () => run(`
  codexAuth.isSignedIn = async () => true;
  await runRoutingCli(['set', 'first', 'codex/original']);
  assert.equal(runSnapshotCli(['first']), 0);
  await runRoutingCli(['set', 'first', 'codex/changed']);
  await runRoutingCli(['set', 'opus', 'codex/family']);
  assert.equal(runSnapshotCli(['opus']), 0);
  sibling.writeConfig({ effort: 'high', bridge: { port: 4242 } });
  assert.equal(runSnapshotCli(['revert', 'first']), 0);
  assert.deepEqual(home.readConfig(), {
    effort: 'high', bridge: { port: 4242 },
    routing: { families: { opus: { providerId: 'codex', model: 'family' } }, aliases: [{ name: 'first', target: { providerId: 'codex', model: 'original' } }] },
    snapshots: { opus: { providerId: 'codex', model: 'family' } },
  });
  assert.equal(runSnapshotCli(['revert']), 0);
  assert.equal(home.readConfig().snapshots, undefined);
`));

test('snapshot and revert read concurrent changes at commit time', () => run(`
  codexAuth.isSignedIn = async () => true;
  await runRoutingCli(['set', 'first', 'codex/original']);
  const update = home.updateConfig;
  home.updateConfig = edit => {
    home.updateConfig = update;
    sibling.updateConfig(cfg => ({ ...cfg, routing: { ...cfg.routing, aliases: [
      { name: 'first', target: { providerId: 'codex', model: 'latest' } },
      { name: 'sibling', target: { providerId: 'codex', model: 'kept' } },
    ] }, snapshots: { opus: null } }));
    return update(edit);
  };
  assert.equal(runSnapshotCli(['first']), 0);
  assert.deepEqual(home.readConfig().snapshots, { opus: null, first: { providerId: 'codex', model: 'latest' } });
  await runRoutingCli(['set', 'first', 'codex/temporary']);
  home.updateConfig = edit => {
    home.updateConfig = update;
    sibling.updateConfig(cfg => ({ ...cfg, routing: { ...cfg.routing, families: { opus: { providerId: 'codex', model: 'concurrent' } } } }));
    return update(edit);
  };
  assert.equal(runSnapshotCli(['revert', 'first']), 0);
  assert.deepEqual(home.readConfig().routing, {
    families: { opus: { providerId: 'codex', model: 'concurrent' } },
    aliases: [{ name: 'sibling', target: { providerId: 'codex', model: 'kept' } }, { name: 'first', target: { providerId: 'codex', model: 'latest' } }],
  });
  assert.deepEqual(home.readConfig().snapshots, { opus: null });
`));

test('Bridge preference commands preserve a competing nested preference', () => run(`
  const { antigravityCompatResult } = await import('./src/antigravityCompat');
  const { geminiInstructionsResult } = await import('./src/geminiInstructions');
  for (const command of [() => antigravityCompatResult(['on'], home), () => geminiInstructionsResult(['prepend-leading-developer-v1'], home)]) {
    home.writeConfig({ bridge: { port: 4242 } });
    const update = home.updateConfig;
    home.updateConfig = edit => {
      home.updateConfig = update;
      sibling.updateConfig(cfg => ({ ...cfg, bridge: { ...cfg.bridge, aliasOnlyModels: false } }));
      return update(edit);
    };
    assert.equal(command().exitCode, 0);
    assert.equal(home.readConfig().bridge.port, 4242);
    assert.equal(home.readConfig().bridge.aliasOnlyModels, false);
  }
`));

test('real App reports busy settings in its status and can retry after the writer releases', () => run(`
  const { createElement, act } = await import('react');
  const { testRender } = await import('@opentui/react/test-utils');
  const { writeFileSync, unlinkSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { App } = await import('./src/app');
  home.writeConfig({ bridge: { aliasPickerShowsModel: true, aliasOnlyModels: true } });
  const lock = join(process.env.WISP_HOME, 'config.lock');
  writeFileSync(lock, 'other writer');
  const ui = await testRender(createElement(App), { width: 100, height: 30 });
  const command = async text => {
    await act(async () => ui.mockInput.typeText(text));
    await act(async () => ui.mockInput.pressKeys(['RETURN']));
    await ui.renderOnce();
  };
  try {
    await ui.renderOnce();
    for (const text of ['/modelids off', '/aliasonly off']) {
      await command(text);
      assert.match(ui.captureCharFrame(), /config is busy/);
      assert.equal(readFileSync(lock, 'utf8'), 'other writer');
    }
    assert.deepEqual(home.readConfig().bridge, { aliasPickerShowsModel: true, aliasOnlyModels: true });
    unlinkSync(lock);
    await command('/modelids off');
    assert.equal(home.readConfig().bridge.aliasPickerShowsModel, false);
    assert.match(ui.captureCharFrame(), /show bare names/);
  } finally { await act(async () => ui.renderer.destroy()); }
`));

test('model, Provider, effort and alias editors report busy writes through their status callbacks', () => run(`
  const { createElement, act } = await import('react');
  const { testRender } = await import('@opentui/react/test-utils');
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ModelPickScreen, ModelFreeScreen, ProviderMenuScreen, EffortPickScreen } = await import('./src/providerScreens');
  const { AliasRenameScreen } = await import('./src/routingScreens');
  const { PROVIDERS } = await import('@wisp/core');
  const provider = PROVIDERS.find(p => p.id === 'groq');
  home.writeConfig({ routing: { families: {}, aliases: [{ name: 'old', target: { providerId: 'groq', model: 'old' } }] } });
  const before = home.readConfig();
  writeFileSync(join(process.env.WISP_HOME, 'config.lock'), 'other writer');
  const cases = [
    [ModelPickScreen, { provider, options: ['new'], onManual() {}, onRefresh() {} }, undefined],
    [ModelFreeScreen, { provider }, 'new'],
    [ProviderMenuScreen, { provider, onSetKey() {}, onSignIn() {}, onSignOut() {} }, undefined],
    [EffortPickScreen, { options: ['high'] }, undefined],
    [AliasRenameScreen, { name: 'old' }, 'new'],
  ];
  for (const [Screen, props, value] of cases) {
    const messages = [];
    const ui = await testRender(createElement(Screen, { ...props, onDone: m => messages.push(m), onBack: m => messages.push(m), onStatus: m => messages.push(m) }), { width: 100, height: 30 });
    try {
      await ui.renderOnce();
      if (value) await act(async () => ui.mockInput.typeText(value));
      await act(async () => ui.mockInput.pressKeys(['RETURN']));
      assert.match(messages.join(' '), /config is busy/, Screen.name);
      assert.deepEqual(home.readConfig(), before);
    } finally { await act(async () => ui.renderer.destroy()); }
  }
`));
