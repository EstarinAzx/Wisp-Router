import { execFile } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { request } from 'http';
import { DEFAULT_BRIDGE_PORT, WispHome, wispHomeDir, desktopStatePath, isUnusableStore, type WispConfig, type WispAuth } from '@wisp/core';
import { mergeAliasCatalog, parseNativeCatalog, readAliasCapabilities, type NativeCatalog, type TargetCapabilities } from './codexCatalog';
import { resolveCodex } from './codex-wisp';
const { TOML } = require('bun') as { TOML: { parse: (text: string) => Record<string, any> } };

type Owned = { before?: string; after: string };
type State = { schema: 1; phase: 'prepared' | 'active' | 'restoring'; codexHome: string; configExisted: boolean; original: string; source?: string;
  fields: Record<string, Owned>; provider: string; nativeModels: string[] };
export type DesktopOptions = {
  codexHome?: string; wispHome?: string;
  probe?: (port: number, secret: string) => Promise<void>;
  catalogs?: (source?: string) => Promise<{ native: NativeCatalog; input: NativeCatalog }>;
  capabilities?: (config: WispConfig, auth: WispAuth) => Promise<(target: { providerId: string; model: string }) => TargetCapabilities | undefined>;
  write?: (path: string, text: string) => void;
};
export const atomicDesktopWrite = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, text, { mode: 0o600 }); renameSync(temp, path); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
};
const readConfig = (path: string): string => { try { return readFileSync(path, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw new Error('Cannot read Codex config.toml'); } };
const parse = (raw: string): Record<string, any> => { try { return TOML.parse(raw); } catch { throw new Error('Invalid Codex TOML; repair config.toml before enabling desktop integration'); } };

// Accumulate logical TOML statements so apparent keys inside multiline strings/arrays stay opaque.
// Unsupported owned layouts fail closed; unrelated valid TOML is never serialized or reformatted.
const ownedLines = (raw: string): Record<string, { text: string; start: number; end: number }> => {
  const found: Record<string, { text: string; start: number; end: number }> = {}; let statement = ''; let table = false; let offset = 0;
  for (const line of raw.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    statement += line; let value: Record<string, unknown>;
    try { value = TOML.parse(statement); } catch { continue; }
    if (statement.trimStart().startsWith('[')) table = true;
    if (!table) for (const key of ['model_provider', 'model_catalog_json']) if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (statement.trimEnd().includes('\n') || typeof value[key] !== 'string') throw new Error('Unsupported multiline or structured owned Codex setting');
      found[key] = { text: statement, start: offset, end: offset + statement.length };
    }
    offset += statement.length; statement = '';
  }
  return found;
};
const profileCheck = (config: Record<string, any>) => {
  const selected = typeof config.profile === 'string' ? config.profiles?.[config.profile] : undefined;
  if (selected && ['model_provider', 'model_catalog_json', 'model_providers'].some(key => key in selected)) throw new Error('Active Codex profile overrides desktop provider/catalog; remove the conflict first');
};
const checkOwned = (raw: string, state: State): void => {
  const parsed = parse(raw); profileCheck(parsed); const lines = ownedLines(raw);
  for (const [key, field] of Object.entries(state.fields)) if (lines[key]?.text !== field.after) throw new Error('Desktop owned-setting conflict; restore the Wisp-owned values before refresh/disable');
  if (raw.split(state.provider).length !== 2) throw new Error('Desktop provider conflict; restore the Wisp provider block before refresh/disable');
  // A matching block inside a multiline string does not establish ownership of a real table.
  try { TOML.parse(raw.slice(0, raw.indexOf(state.provider))); } catch { throw new Error('Desktop provider conflict'); }
  // The exact block is insufficient if a user adds a nested provider table after it.
  if (JSON.stringify(parsed.model_providers?.wisp_desktop) !== JSON.stringify(parse(state.provider).model_providers?.wisp_desktop)) throw new Error('Desktop provider conflict');
};

export const probeDesktopBridge = (port: number, secret: string): Promise<void> => new Promise((resolveProbe, reject) => {
  const req = request({ host: '127.0.0.1', port, path: '/codex-desktop/status', headers: { 'x-api-key': secret }, agent: false }, res => {
    let body = ''; res.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(new Error('Invalid Bridge response')); });
    res.on('end', () => { try { if (res.statusCode !== 200 || JSON.parse(body).protocol !== 1) throw new Error(); resolveProbe(); }
      catch { reject(new Error('Bridge lacks signed desktop support or its secret changed; start the current Wisp Bridge with wisp serve')); } });
  });
  req.setTimeout(2000, () => req.destroy(new Error('timeout')));
  req.once('error', () => reject(new Error('Bridge not reachable; start the current Wisp Bridge with wisp serve'))); req.end();
});

const loadCatalogs = async (source?: string): Promise<{ native: NativeCatalog; input: NativeCatalog }> => {
  // A user catalog cannot authorize native credentials. Export native identity in a fresh home/cwd.
  const dir = mkdtempSync(join(tmpdir(), 'wisp-native-catalog-')); const codex = resolveCodex();
  try {
    const raw = await new Promise<string>((yes, no) => execFile(codex.file, [...codex.args, 'debug', 'models', '--bundled'],
      { cwd: dir, env: { ...process.env, CODEX_HOME: dir }, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout) => error ? no(new Error('Could not export installed Codex native catalog')) : yes(stdout)));
    const native = parseNativeCatalog(JSON.parse(raw));
    const input = source ? parseNativeCatalog(JSON.parse(readFileSync(source, 'utf8'))) : native;
    return { native, input };
  } catch { throw new Error('Could not read native/user catalog; check Codex installation and original model_catalog_json'); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

export const desktopAction = async (action: 'enable' | 'status' | 'refresh' | 'disable', options: DesktopOptions = {}) => {
  const codexHome = resolve(options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex'));
  const wispDir = resolve(options.wispHome ?? wispHomeDir()); const home = new WispHome(wispDir);
  const configFile = join(codexHome, 'config.toml'); const stateFile = desktopStatePath(wispDir); const catalogFile = join(dirname(stateFile), 'models.json');
  const write = options.write ?? atomicDesktopWrite;
  const raw = readConfig(configFile); let state: State | undefined;
  if (existsSync(stateFile)) {
    try { state = JSON.parse(readFileSync(stateFile, 'utf8')); if (state?.schema !== 1 || !state.fields || !state.provider || !Array.isArray(state.nativeModels)) throw new Error(); }
    catch { throw new Error('Invalid desktop recovery state; retain state.json and repair it before making changes'); }
    if (state!.codexHome !== codexHome) throw new Error('This WISP_HOME already belongs to another CODEX_HOME desktop integration');
  }
  const status = (enabled: boolean, extra = {}) => ({ enabled, codexHome, catalog: enabled ? catalogFile : undefined, ...extra });
  if (action === 'status') {
    if (!state) return status(false, { state: 'disabled', restartRequired: false });
    let conflict = false; try { checkOwned(raw, state); } catch { conflict = true; }
    let bridge = false; try { await (options.probe ?? probeDesktopBridge)(home.readConfig().bridge?.port ?? DEFAULT_BRIDGE_PORT, home.readAuth().bridgeSecret ?? ''); bridge = true; } catch {}
    return status(state.phase === 'active' && !conflict, { state: conflict ? 'conflict' : state.phase, bridge, restartRequired: true });
  }
  if (action === 'disable') {
    if (!state) return status(false);
    // Recovery compares only owned statements: unrelated edits can happen before installation,
    // or after a restore committed but before its journal was removed.
    let restored = raw;
    const current = parse(raw); const lines = ownedLines(raw);
    const originalOwned = !current.model_providers?.wisp_desktop && Object.entries(state.fields).every(([key, field]) => lines[key]?.text === field.before);
    if (raw !== state.original && !(state.phase !== 'active' && originalOwned)) {
      checkOwned(raw, state); restored = raw.replace(state.provider, '');
      for (const [key, field] of Object.entries(state.fields)) { const span = ownedLines(restored)[key]; restored = restored.slice(0, span.start) + (field.before ?? '') + restored.slice(span.end); }
    }
    parse(restored);
    if (readConfig(configFile) !== raw) throw new Error('Codex config changed concurrently; retry disable');
    write(stateFile, JSON.stringify({ ...state, phase: 'restoring' }));
    if (!state.configExisted && restored === '') { if (existsSync(configFile)) unlinkSync(configFile); }
    else write(configFile, restored);
    unlinkSync(stateFile); if (existsSync(catalogFile)) unlinkSync(catalogFile);
    return status(false, { restartRequired: true });
  }
  const parsed = parse(raw); profileCheck(parsed);
  if (state) {
    if (state.phase !== 'active') throw new Error('Incomplete desktop activation; run wisp codex-desktop disable to recover, then enable');
    checkOwned(raw, state);
    if (action === 'enable') return status(true, { restartRequired: true });
  } else {
    if (action === 'refresh') throw new Error('Desktop integration is disabled; run wisp codex-desktop enable');
    if (existsSync(catalogFile)) throw new Error('Unowned desktop catalog file already exists; move it and update any original catalog reference before enabling');
    if (parsed.model_providers?.wisp_desktop || parsed.model_provider === 'wisp_desktop') throw new Error('Reserved wisp_desktop provider already exists; resolve the conflict first');
    ownedLines(raw);
  }
  if (isUnusableStore(readConfig(join(wispDir, 'config.json')))) throw new Error('Invalid Wisp config.json; repair it before enabling desktop integration');
  const config = home.readConfig(); const auth = home.readAuth(); const secret = auth.bridgeSecret?.trim(); const port = config.bridge?.port ?? DEFAULT_BRIDGE_PORT;
  if (!secret) throw new Error('No Bridge secret; start the current Bridge with wisp serve');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Bridge port');
  if (state) {
    const provider = parsed.model_providers?.wisp_desktop;
    if (provider.http_headers?.['x-api-key'] !== secret || provider.base_url !== `http://127.0.0.1:${port}/codex-desktop/v1`) throw new Error('Bridge credentials/address changed; run codex-desktop disable then enable');
  }
  await (options.probe ?? probeDesktopBridge)(port, secret);
  const source = state ? state.source : (typeof parsed.model_catalog_json === 'string' ? (isAbsolute(parsed.model_catalog_json) ? parsed.model_catalog_json : resolve(codexHome, parsed.model_catalog_json)) : undefined);
  const { native, input } = await (options.catalogs ?? loadCatalogs)(source);
  parseNativeCatalog(native); parseNativeCatalog(input);
  const combined = { ...native, ...input, models: [...new Map([...native.models, ...input.models].map(m => [m.slug, m])).values()] };
  const catalog = mergeAliasCatalog(combined, config, await (options.capabilities ?? readAliasCapabilities)(config, auth));
  let next = raw;
  if (!state) {
    const lines = ownedLines(raw); const fields: Record<string, Owned> = {};
    for (const [key, value] of Object.entries({ model_provider: 'wisp_desktop', model_catalog_json: catalogFile })) {
      const after = `${key} = ${JSON.stringify(value)}\n`; fields[key] = { before: lines[key]?.text, after };
      const span = ownedLines(next)[key]; next = span ? next.slice(0, span.start) + after + next.slice(span.end) : after + next;
    }
    const provider = `\n[model_providers.wisp_desktop]\nname = "Wisp signed desktop"\nbase_url = "http://127.0.0.1:${port}/codex-desktop/v1"\nwire_api = "responses"\nrequires_openai_auth = true\nsupports_websockets = false\nhttp_headers = { "x-api-key" = ${JSON.stringify(secret)} }\n`;
    next += provider;
    state = { schema: 1, phase: 'prepared', codexHome, configExisted: existsSync(configFile), original: raw, source, fields, provider, nativeModels: [] };
  }
  parse(next); checkOwned(next, state);
  state = { ...state, phase: 'prepared', nativeModels: native.models.map(m => m.slug as string) };
  if (action === 'enable' && (existsSync(stateFile) || existsSync(catalogFile))) throw new Error('Desktop state/catalog already exists after preflight; inspect the files before retrying');
  // Journal first. A crash before/after either following write is repaired by disable.
  write(stateFile, JSON.stringify(state)); write(catalogFile, JSON.stringify(catalog));
  if (readConfig(configFile) !== raw) throw new Error('Codex config changed concurrently; recovery journal retained');
  write(configFile, next); write(stateFile, JSON.stringify({ ...state, phase: 'active' }));
  return status(true, { restartRequired: true });
};

export const runCodexDesktop = async (args: string[]): Promise<number> => {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: wisp codex-desktop enable|status|refresh|disable [--json]\nOpt-in signed ChatGPT desktop routing. Start a current Wisp Bridge (wisp serve), then enable.\nRestart Codex after enable/refresh/disable. Route edits apply live. Refresh updates picker entries.'); return 0;
  }
  if (!['enable', 'status', 'refresh', 'disable'].includes(args[0]) || args.slice(1).some(a => a !== '--json')) { console.error('Usage: wisp codex-desktop enable|status|refresh|disable [--json]'); return 1; }
  try {
    const result = await desktopAction(args[0] as Parameters<typeof desktopAction>[0]);
    console.log(args.includes('--json') ? JSON.stringify(result) : `Desktop integration: ${result.enabled ? 'enabled' : 'disabled'}. ${'state' in result ? `State: ${result.state}. ` : ''}Restart Codex after configuration/catalog changes. The Wisp Bridge must remain running.`); return 0;
  } catch (error) { console.error(error instanceof Error ? error.message : 'Desktop operation failed; recovery state retained'); return 1; }
};
