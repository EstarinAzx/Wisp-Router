import { test, expect } from 'bun:test';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { desktopAction, probeDesktopBridge, atomicDesktopWrite, type DesktopOptions } from '../src/codexDesktop';

const native = { client: 'native-view', models: [{ slug: 'native-good', display_name: 'Native good', visibility: 'list', supported_reasoning_levels: [{ effort: 'medium', description: 'Medium' }], private_future_metadata: { preserved: true } }] };
const original = '# original\nmodel = "native-good" # original choice\nmodel_reasoning_effort = "medium"\n';
async function fixture(run: (opts: DesktopOptions, file: string, state: string) => Promise<void>) {
  const folder = mkdtempSync(join(tmpdir(), 'wisp-policy-')); const codexHome = join(folder, 'codex'), wispHome = join(folder, 'wisp'); mkdirSync(codexHome); mkdirSync(wispHome);
  const file = join(codexHome, 'config.toml'); writeFileSync(file, original); writeFileSync(join(codexHome, 'auth.json'), 'native-auth-untouched');
  writeFileSync(join(wispHome, 'auth.json'), '{"bridgeSecret":"local-secret"}');
  writeFileSync(join(wispHome, 'config.json'), JSON.stringify({ routing: { families: {}, aliases: [{ name: 'external-only', target: { providerId: 'custom', model: 'target' } }] } }));
  const opts: DesktopOptions = { codexHome, wispHome, probe: async () => {}, catalogs: async () => ({ native, input: { models: [{ slug: 'user-unknown', visibility: 'list' }] } }), capabilities: async () => () => undefined };
  try { await run(opts, file, join(wispHome, 'codex-desktop/state.json')); } finally { rmSync(folder, { recursive: true, force: true }); }
}
test('ordinary native snapshot is authoritative; alias refresh never re-exports or promotes cache/overlay rows', async () => fixture(async (opts, file, stateFile) => {
  let calls = 0; opts.catalogs = async () => { calls++; return { native, input: { models: [{ slug: 'user-unknown' }] } }; };
  await desktopAction('enable', opts); const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  expect(state.nativeCatalog).toEqual(native); expect(state.nativeSource).toBe('native-client-export'); expect(Number.isFinite(Date.parse(state.nativeCapturedAt))).toBe(true);
  writeFileSync(join(opts.codexHome!, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'different-account-model' }] }));
  opts.catalogs = async () => { throw new Error('refresh must not export'); };
  const refreshed = await desktopAction('refresh', opts); expect(calls).toBe(1); expect(JSON.stringify(refreshed)).toContain('saved');
  const catalog = JSON.parse(readFileSync(join(opts.wispHome!, 'codex-desktop/models.json'), 'utf8'));
  expect(catalog.models.map((m: any) => m.slug)).toEqual(['native-good', 'external-only']); expect(catalog.models[0]).toEqual(native.models[0]);
  expect(JSON.parse(readFileSync(stateFile, 'utf8')).nativeCapturedAt).toBe(state.nativeCapturedAt);
  await desktopAction('disable', opts); opts.catalogs = async () => ({ native: { models: [{ ...native.models[0], slug: 'new-native' }] }, input: native });
  await desktopAction('enable', opts); expect(JSON.parse(readFileSync(stateFile, 'utf8')).nativeModels).toEqual(['new-native']);
}));
test('original overlays and non-native discovery settings fail before native export or any write', async () => fixture(async (opts, file, state) => {
  let exports = 0; opts.catalogs = async () => { exports++; return { native, input: native }; };
  const userFile = join(opts.codexHome!, 'user-models.json'); writeFileSync(userFile, JSON.stringify({ models: [{ slug: 'unknown-user-row' }] }));
  for (const raw of [`model_catalog_json=${JSON.stringify(userFile)}\n`, 'model_provider="custom-provider"\n', '[model_providers.openai]\nbase_url="https://not-native.invalid"\n']) {
    writeFileSync(file, raw); await expect(desktopAction('enable', opts)).rejects.toThrow(/native/i); expect(readFileSync(file, 'utf8')).toBe(raw); expect(existsSync(state)).toBe(false);
  }
  expect(exports).toBe(0); expect(JSON.parse(readFileSync(userFile, 'utf8')).models[0].slug).toBe('unknown-user-row');
}));
test('unsupported Antigravity aliases and native overrides are excluded with explicit route reasons', async () => fixture(async (opts, file, state) => {
  const configFile = join(opts.wispHome!, 'config.json'); const config = { routing: { families: {}, aliases: [{ name: 'blocked-alias', target: { providerId: 'antigravity', model: 'gemini-model' } }, { name: 'good-alias', target: { providerId: 'custom', model: 'target' } }], codexModels: { 'native-good': { providerId: 'antigravity', model: 'gemini-model' } } } };
  const raw = JSON.stringify(config); writeFileSync(configFile, raw);
  const result = await desktopAction('enable', opts); const catalog = JSON.parse(readFileSync(join(opts.wispHome!, 'codex-desktop/models.json'), 'utf8'));
  expect(catalog.models.map((m: any) => m.slug)).toEqual(['good-alias']); expect(JSON.stringify(result)).toContain('native-override'); expect(JSON.stringify(result)).toContain('blocked-alias'); expect(JSON.stringify(result)).toContain('instruction ordering');
  expect(readFileSync(configFile, 'utf8')).toBe(raw); expect(JSON.parse(readFileSync(state, 'utf8')).nativeModels).toEqual(['native-good']);
}));
test('repeat enable and refresh refuse old hosts or missing native snapshot without mutation; legacy disable works', async () => fixture(async (opts, file, stateFile) => {
  await desktopAction('enable', opts); const before = readFileSync(file, 'utf8'); const state = readFileSync(stateFile, 'utf8');
  opts.probe = async () => { throw new Error('old host protocol'); };
  for (const action of ['enable', 'refresh'] as const) await expect(desktopAction(action, opts)).rejects.toThrow('old host protocol');
  expect(readFileSync(file, 'utf8')).toBe(before); expect(readFileSync(stateFile, 'utf8')).toBe(state);
  opts.probe = async () => {}; const legacy = JSON.parse(state); delete legacy.nativeCatalog; delete legacy.nativeSource; writeFileSync(stateFile, JSON.stringify(legacy));
  for (const action of ['enable', 'refresh'] as const) await expect(desktopAction(action, opts)).rejects.toThrow(/disable/i);
  expect(readFileSync(file, 'utf8')).toBe(before); await desktopAction('disable', opts); expect(readFileSync(file, 'utf8')).toBe(original);
}));
test('probe refuses old protocol 1 and accepts current protocol 2', async () => {
  for (const protocol of [1, 2]) {
    const server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ protocol })); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const port = (server.address() as any).port;
    try { if (protocol === 1) await expect(probeDesktopBridge(port, 'synthetic')).rejects.toThrow(); else await probeDesktopBridge(port, 'synthetic'); }
    finally { await new Promise<void>(r => server.close(() => r())); }
  }
});
test('disable restores only a selected Wisp-only model, preserves effort, and warns when none is invalid', async () => fixture(async (opts, file) => {
  await desktopAction('enable', opts); writeFileSync(file, readFileSync(file, 'utf8').replace('model = "native-good" # original choice', 'model = "external-only" # UI').replace('"medium"', '"none"'));
  const result = await desktopAction('disable', opts);
  expect(readFileSync(file, 'utf8')).toBe(original.replace('"medium"', '"none"')); expect(result).toMatchObject({ selectionRestored: true, actionRequired: true });
}));
test('disable recognizes removed aliases but preserves native collisions and new native selections', async () => {
  for (const selection of ['external-only', 'native-good']) await fixture(async (opts, file) => {
    await desktopAction('enable', opts); writeFileSync(join(opts.wispHome!, 'config.json'), '{"routing":{"families":{},"aliases":[]}}'); await desktopAction('refresh', opts);
    writeFileSync(file, readFileSync(file, 'utf8').replace('model = "native-good" # original choice', `model = "${selection}" # UI`));
    const result = await desktopAction('disable', opts);
    expect(result.selectionRestored).toBe(selection === 'external-only');
    expect(readFileSync(file, 'utf8')).toBe(selection === 'external-only' ? original : original.replace('# original choice', '# UI'));
  });
});
test('disable leaves profile model and invalid original model choices explicit/action-required', async () => {
  await fixture(async (opts, file) => {
    const raw = 'profile="work"\n' + original + '[profiles.work]\nmodel="external-only"\n'; writeFileSync(file, raw); await desktopAction('enable', opts);
    expect(await desktopAction('disable', opts)).toMatchObject({ selectionRestored: false, actionRequired: true }); expect(readFileSync(file, 'utf8')).toBe(raw);
  });
  await fixture(async (opts, file) => {
    const raw = original.replace('"native-good"', '"original-unavailable"'); writeFileSync(file, raw); await desktopAction('enable', opts);
    writeFileSync(file, readFileSync(file, 'utf8').replace('"original-unavailable"', '"external-only"'));
    expect(await desktopAction('disable', opts)).toMatchObject({ selectionRestored: true, actionRequired: true }); expect(readFileSync(file, 'utf8')).toBe(raw);
  });
});
test('known Grok wire effort stays advertised when optional public context metadata is unavailable', async () => fixture(async opts => {
  const script = `globalThis.fetch=async()=>new Response('{}',{headers:{'content-type':'application/json'}}); const {readAliasCapabilities}=await import(${JSON.stringify(resolve(import.meta.dir, '../src/codexCatalog.ts'))}); const get=await readAliasCapabilities({routing:{families:{},aliases:[{name:'grok',target:{providerId:'xai',model:'grok-4.6'}}]}},{}); console.log(JSON.stringify(get({providerId:'xai',model:'grok-4.6'})??null));`;
  const result = Bun.spawnSync([process.execPath, '-e', script], { env: { ...process.env, WISP_HOME: opts.wispHome! } });
  expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout.toString())).toMatchObject({ efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' });
}));
test('absent original model restores absence and native-name alias collisions remain untouched', async () => {
  await fixture(async (opts, file) => {
    const raw = original.replace('model = "native-good" # original choice\n', ''); writeFileSync(file, raw); await desktopAction('enable', opts);
    writeFileSync(file, 'model="external-only"\n' + readFileSync(file, 'utf8')); const result = await desktopAction('disable', opts);
    expect(result.selectionRestored).toBe(true); expect(readFileSync(file, 'utf8')).toBe(raw);
  });
  await fixture(async (opts, file) => {
    writeFileSync(join(opts.wispHome!, 'config.json'), JSON.stringify({ routing: { families: {}, aliases: [{ name: 'native-good', target: { providerId: 'antigravity', model: 'gemini-model' } }] } }));
    const enabled = await desktopAction('enable', opts); expect(JSON.stringify(enabled)).toContain('native-alias-shadow');
    const result = await desktopAction('disable', opts); expect(result).toMatchObject({ selectionRestored: false, actionRequired: false }); expect(readFileSync(file, 'utf8')).toBe(original);
  });
});
test('selection cleanup survives a post-write crash and preserves unrelated recovery edits', async () => fixture(async (opts, file) => {
  await desktopAction('enable', opts); writeFileSync(file, readFileSync(file, 'utf8').replace('"native-good"', '"external-only"'));
  opts.write = (path, text) => { atomicDesktopWrite(path, text); if (path === file) throw new Error('crash after selection restore'); };
  await expect(desktopAction('disable', opts)).rejects.toThrow(); delete opts.write; writeFileSync(file, readFileSync(file, 'utf8') + '# user recovery edit\n');
  await desktopAction('disable', opts); expect(readFileSync(file, 'utf8')).toBe(original + '# user recovery edit\n');
}));
test('old native snapshot remains explicitly saved and missing snapshot fails closed under either host', async () => fixture(async (opts, file, stateFile) => {
  await desktopAction('enable', opts); const state = JSON.parse(readFileSync(stateFile, 'utf8')); state.nativeCapturedAt = '2000-01-01T00:00:00.000Z'; writeFileSync(stateFile, JSON.stringify(state));
  opts.catalogs = async () => { throw new Error('must not claim fresh native discovery'); };
  const result = await desktopAction('refresh', opts); expect(JSON.stringify(result)).toContain('saved'); expect(JSON.stringify(result)).toContain('2000-01-01');
  const missing = JSON.parse(readFileSync(stateFile, 'utf8')); delete missing.nativeCatalog; writeFileSync(stateFile, JSON.stringify(missing));
  opts.probe = async () => { throw new Error('old host'); }; const before = readFileSync(file, 'utf8');
  for (const action of ['enable', 'refresh'] as const) await expect(desktopAction(action, opts)).rejects.toThrow(/Disable/);
  expect(readFileSync(file, 'utf8')).toBe(before); await desktopAction('disable', opts); expect(readFileSync(file, 'utf8')).toBe(original);
}));
test('invalid user-edited model types survive disable with an action-required notice', async () => fixture(async (opts, file) => {
  await desktopAction('enable', opts); const edited = readFileSync(file, 'utf8').replace('model = "native-good" # original choice', 'model = 0').replace('model_reasoning_effort = "medium"\n', ''); writeFileSync(file, edited);
  const result = await desktopAction('disable', opts); expect(result.actionRequired).toBe(true); expect(readFileSync(file, 'utf8')).toContain('model = 0');
}));
