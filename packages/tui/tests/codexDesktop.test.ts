import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { desktopAction, atomicDesktopWrite, type DesktopOptions } from '../src/codexDesktop';

const native = { models: [{ slug: 'gpt-native', display_name: 'Native', visibility: 'list', future_metadata: { kept: true } }] };
const original = '# keep every byte\r\nmodel = "my-default" # keep\r\nmodel_provider = "openai" # original\r\nmodel_catalog_json = "original.json"\r\n\r\n[permissions]\r\npolicy = "keep"\r\n[profiles.other]\r\nmodel_provider = "elsewhere"\r\n';
async function fixture(run: (opts: DesktopOptions, root: string, config: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wisp desktop ')); const codexHome = join(root, 'codex'); const wispHome = join(root, 'wisp');
  mkdirSync(codexHome); mkdirSync(wispHome); const config = join(codexHome, 'config.toml');
  writeFileSync(config, original); writeFileSync(join(codexHome, 'auth.json'), 'NATIVE_UNTOUCHED');
  writeFileSync(join(wispHome, 'auth.json'), JSON.stringify({ bridgeSecret: 'synthetic-local-secret' }));
  writeFileSync(join(wispHome, 'config.json'), JSON.stringify({ routing: { families: {}, aliases: [{ name: 'external-alias', target: { providerId: 'custom', model: 'target' } }] } }));
  writeFileSync(join(codexHome, 'original.json'), JSON.stringify(native));
  const opts: DesktopOptions = { codexHome, wispHome, probe: async () => {}, catalogs: async () => ({ native, input: native }), capabilities: async () => () => undefined };
  try { await run(opts, root, config); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('source dispatcher runs renderer-free outside source cwd and respects explicit homes', async () => fixture(async (opts, root) => {
  const entry = resolve(import.meta.dir, '../src/index.tsx');
  for (const args of [['status', '--json'], ['--help'], ['disable', '--json']]) {
    const result = Bun.spawnSync([process.execPath, entry, 'codex-desktop', ...args], { cwd: root, env: { ...process.env, CODEX_HOME: opts.codexHome!, WISP_HOME: opts.wispHome! } });
    expect(result.exitCode).toBe(0); expect(result.stderr.toString()).toBe('');
    if (args.includes('--json')) expect(JSON.parse(result.stdout.toString()).codexHome).toBe(opts.codexHome);
    else expect(result.stdout.toString()).toContain('Restart Codex');
  }
}));
test('enable persists signed provider/catalog, restores owned settings and preserves later edits', async () => fixture(async (opts, root, config) => {
  const result = await desktopAction('enable', opts); expect(result.enabled).toBe(true);
  const enabled = readFileSync(config, 'utf8'); const parsed = Bun.TOML.parse(enabled) as any;
  expect(parsed.model).toBe('my-default'); expect(parsed.model_providers.wisp_desktop.requires_openai_auth).toBe(true);
  expect(parsed.model_providers.wisp_desktop.http_headers['x-api-key']).toBe('synthetic-local-secret');
  expect(parsed.model_providers.wisp_desktop.supports_websockets).toBe(false);
  expect(JSON.parse(readFileSync(parsed.model_catalog_json, 'utf8')).models[0]).toEqual(native.models[0]);
  expect(JSON.stringify(result)).not.toContain('synthetic-local-secret');
  expect(readFileSync(join(opts.codexHome!, 'auth.json'), 'utf8')).toBe('NATIVE_UNTOUCHED');
  writeFileSync(config, enabled + '\r\n[user_added]\r\nkeep = "yes"\r\n');
  await desktopAction('enable', opts); await desktopAction('disable', opts);
  expect(readFileSync(config, 'utf8')).toBe(original + '\r\n[user_added]\r\nkeep = "yes"\r\n');
  expect((await desktopAction('disable', opts)).enabled).toBe(false);
}));
test('refresh reads original source and removes generated aliases; native identity ignores user additions', async () => fixture(async (opts, root, config) => {
  const sources: unknown[] = []; opts.catalogs = async source => { sources.push(source); return { native, input: { models: [...native.models, { slug: 'unknown/external', visibility: 'list' }] } }; };
  await desktopAction('enable', opts);
  writeFileSync(join(opts.wispHome!, 'config.json'), JSON.stringify({ routing: { families: {}, aliases: [] } }));
  await desktopAction('refresh', opts);
  expect(sources).toEqual([join(opts.codexHome!, 'original.json'), join(opts.codexHome!, 'original.json')]);
  const saved = JSON.parse(readFileSync(join(opts.wispHome!, 'codex-desktop', 'state.json'), 'utf8'));
  expect(saved.nativeModels).toEqual(['gpt-native']);
  const catalog = JSON.parse(readFileSync((Bun.TOML.parse(readFileSync(config, 'utf8')) as any).model_catalog_json, 'utf8'));
  expect(catalog.models.map((m: any) => m.slug)).toEqual(['gpt-native', 'unknown/external']);
}));
test('malformed/configured profile/reserved provider and unsupported owned layouts fail without mutation', async () => fixture(async (opts, root, config) => {
  for (const text of ['bad=[', 'model_provider="a"\nmodel_provider="b"', 'profile="x"\n[profiles.x]\nmodel_provider="other"', '[model_providers.wisp_desktop]\nname="user"', 'model_provider = """multi\nline"""']) {
    writeFileSync(config, text); await expect(desktopAction('enable', opts)).rejects.toThrow(); expect(readFileSync(config, 'utf8')).toBe(text);
    expect(existsSync(join(opts.wispHome!, 'codex-desktop', 'state.json'))).toBe(false);
  }
}));
test('owned-field changes refuse refresh/disable and retain recovery state', async () => fixture(async (opts, root, config) => {
  await desktopAction('enable', opts); const changed = readFileSync(config, 'utf8').replace('model_provider = "wisp_desktop"', 'model_provider = "user"'); writeFileSync(config, changed);
  for (const action of ['refresh', 'disable'] as const) await expect(desktopAction(action, opts)).rejects.toThrow(/conflict/i);
  expect(readFileSync(config, 'utf8')).toBe(changed); expect(existsSync(join(opts.wispHome!, 'codex-desktop', 'state.json'))).toBe(true);
}));
test('refresh fails before writes when the Bridge secret or port no longer matches enabled config', async () => fixture(async (opts, root, config) => {
  await desktopAction('enable', opts); const before = readFileSync(config, 'utf8');
  writeFileSync(join(opts.wispHome!, 'auth.json'), JSON.stringify({ bridgeSecret: 'rotated-secret' }));
  await expect(desktopAction('refresh', opts)).rejects.toThrow(/disable.*enable/i); expect(readFileSync(config, 'utf8')).toBe(before);
}));
test('Bridge/catalog failures and malformed Wisp config do not mutate Codex or create recovery state', async () => fixture(async (opts, root, config) => {
  opts.probe = async () => { throw new Error('old Bridge'); }; await expect(desktopAction('enable', opts)).rejects.toThrow('old Bridge');
  opts.probe = async () => {}; opts.catalogs = async () => { throw new Error('missing catalog'); }; await expect(desktopAction('enable', opts)).rejects.toThrow('missing catalog');
  opts.catalogs = async () => ({ native, input: native }); writeFileSync(join(opts.wispHome!, 'config.json'), '{bad'); await expect(desktopAction('enable', opts)).rejects.toThrow(/Wisp config/i);
  expect(readFileSync(config, 'utf8')).toBe(original); expect(existsSync(join(opts.wispHome!, 'codex-desktop/state.json'))).toBe(false);
}));
test('failed disable retains journal and retries without losing later edits', async () => fixture(async (opts, root, config) => {
  await desktopAction('enable', opts); const enabled = readFileSync(config, 'utf8'); writeFileSync(config, enabled + '\n[after]\nx=1\n');
  opts.write = () => { throw new Error('disk'); }; await expect(desktopAction('disable', opts)).rejects.toThrow(); delete opts.write;
  expect(existsSync(join(opts.wispHome!, 'codex-desktop/state.json'))).toBe(true); await desktopAction('disable', opts);
  expect(readFileSync(config, 'utf8')).toBe(original + '\n[after]\nx=1\n');
}));
test('disable recovers a crash after restoring config but before removing journal', async () => fixture(async (opts, root, config) => {
  await desktopAction('enable', opts); writeFileSync(config, readFileSync(config, 'utf8') + '\n[after]\nx=1\n');
  opts.write = (path, text) => { atomicDesktopWrite(path, text); if (path === config) throw new Error('crash after restore'); };
  await expect(desktopAction('disable', opts)).rejects.toThrow(); delete opts.write;
  await desktopAction('disable', opts); expect(readFileSync(config, 'utf8')).toBe(original + '\n[after]\nx=1\n');
}));
test('disable edits the owned statement rather than matching text inside unrelated multiline strings', async () => fixture(async (opts, root, config) => {
  await desktopAction('enable', opts);
  const unrelated = 'notes = \'\'\'\nmodel_provider = "wisp_desktop"\n\'\'\'\n';
  writeFileSync(config, unrelated + readFileSync(config, 'utf8'));
  await desktopAction('disable', opts); expect(readFileSync(config, 'utf8')).toBe(unrelated + original);
}));
test('activation write failures remain recoverable at every write stage', async () => {
  for (const failAt of [1, 2, 3, 4]) await fixture(async (opts, root, config) => {
    let writes = 0; opts.write = (path, text) => { if (++writes === failAt) throw new Error('injected disk failure'); atomicDesktopWrite(path, text); };
    await expect(desktopAction('enable', opts)).rejects.toThrow(); delete opts.write;
    await desktopAction('disable', opts); expect(readFileSync(config, 'utf8')).toBe(original);
  });
});
test('missing config remains absent after disable and multiline unrelated TOML stays intact', async () => fixture(async (opts, root, config) => {
  const sources: unknown[] = []; opts.catalogs = async source => { sources.push(source); return { native, input: native }; };
  rmSync(config); await desktopAction('enable', opts); await desktopAction('refresh', opts); expect(sources).toEqual([undefined, undefined]);
  await desktopAction('disable', opts); expect(existsSync(config)).toBe(false);
  const tricky = 'description = """\nmodel_provider = "embedded"\n[model_providers.wisp_desktop]\n"""\nvalues = [\n  "a", "b",\n]\n'; writeFileSync(config, tricky);
  await desktopAction('enable', opts); await desktopAction('disable', opts); expect(readFileSync(config, 'utf8')).toBe(tricky);
}));
