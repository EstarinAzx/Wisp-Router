import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as desktop from '../src/codexDesktop';

const fixture = async (run: (options: desktop.DesktopOptions, config: string, state: string) => Promise<void>) => {
  const folder = mkdtempSync(join(tmpdir(), 'wisp-gpt-desktop-'));
  const codexHome = join(folder, 'codex'), wispHome = join(folder, 'wisp'); mkdirSync(codexHome); mkdirSync(wispHome);
  const config = join(codexHome, 'config.toml'); writeFileSync(config, '# native preferences\nmodel="native"\n');
  writeFileSync(join(codexHome, 'auth.json'), 'native-auth');
  writeFileSync(join(wispHome, 'auth.json'), '{"bridgeSecret":"synthetic-secret"}');
  writeFileSync(join(wispHome, 'config.json'), JSON.stringify({ routing: { families: {}, aliases: [{ name: 'ag', target: { providerId: 'antigravity', model: 'gemini-3.8-flash-tiered' } }] } }));
  const native = { models: [{ slug: 'native', display_name: 'Native', visibility: 'list' }] };
  const options: desktop.DesktopOptions = { codexHome, wispHome, probe: async () => {}, catalogs: async () => ({ native, input: native }), capabilities: async () => () => undefined };
  try { await run(options, config, join(wispHome, 'codex-desktop/state.json')); }
  finally { expect(dirname(resolve(folder))).toBe(resolve(tmpdir())); rmSync(folder, { recursive: true, force: true }); }
};

test('/gpt-desktop on/off uses journaled setup, includes qualified Antigravity and preserves later edits', async () => fixture(async (options, config, state) => {
  expect(desktop.runGptDesktop).toBeFunction();
  const before = readFileSync(config, 'utf8');
  const message = await desktop.runGptDesktop(['on'], options);
  expect(message).toContain('Restart Desktop'); expect(message).toContain('globally');
  expect(JSON.parse(readFileSync(state, 'utf8')).antigravityInstructions).toBe('hoist-developer');
  const catalog = JSON.parse(readFileSync(join(options.wispHome!, 'codex-desktop/models.json'), 'utf8'));
  expect(catalog.models.map((model: any) => model.slug)).toEqual(['native', 'ag']);
  writeFileSync(config, readFileSync(config, 'utf8') + '# later user edit\n');
  await desktop.runGptDesktop(['ON'], options);
  const off = await desktop.runGptDesktop(['off'], options);
  expect(off).toContain('Desktop off'); expect(off).toContain('Bridge state unchanged');
  expect(readFileSync(config, 'utf8')).toBe(before + '# later user edit\n'); expect(existsSync(state)).toBe(false);
  expect(readFileSync(join(options.codexHome!, 'auth.json'), 'utf8')).toBe('native-auth');
}));

test('/gpt-desktop rejects missing/extra/invalid arguments before setup and preserves configuration conflicts', async () => fixture(async (options, config, state) => {
  for (const args of [[], ['yes'], ['on', 'off']]) {
    await expect(desktop.runGptDesktop(args, options)).rejects.toThrow('Usage: /gpt-desktop on|off');
    expect(existsSync(state)).toBe(false);
  }
  await desktop.runGptDesktop(['on'], options);
  const edited = readFileSync(config, 'utf8').replace('model_provider = "wisp_desktop"', 'model_provider = "user-choice"');
  writeFileSync(config, edited);
  await expect(desktop.runGptDesktop(['off'], options)).rejects.toThrow(/conflict/i);
  expect(readFileSync(config, 'utf8')).toBe(edited); expect(existsSync(state)).toBe(true);
}));
