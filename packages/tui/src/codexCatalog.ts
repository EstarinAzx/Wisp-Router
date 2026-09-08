// Native client profiles and backend capabilities are different contracts. Preserve native rows
// verbatim; Wisp aliases use a small client profile with only verified Target capabilities enabled.
import { execFile } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  PROVIDERS, codexCatalog, codexEffortOptions, parseCodexModels, getModelsDevCatalog, lookupModelsDevCaps,
  anthropicThinkingEffort, xaiReasoning,
  type WispConfig, type WispAuth, type Provider, type Target, type ModelCaps,
} from '@wisp/core';

export type NativeCatalog = { models: Record<string, unknown>[]; [key: string]: unknown };
export type TargetCapabilities = ModelCaps & { efforts?: string[]; defaultEffort?: string };

export const parseNativeCatalog = (value: unknown): NativeCatalog => {
  // Reuse identity/envelope validation without reducing the complete native descriptors.
  parseCodexModels(value);
  return value as NativeCatalog;
};

const runExport = (codex: { file: string; args: string[] }, args: string[], env: NodeJS.ProcessEnv, timeout: number, cwd?: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(codex.file, [...codex.args, ...args], { env, cwd, timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', windowsHide: true, shell: false },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });

// Config options are global in Codex even when written after a subcommand. Prompt text following
// `--` is opaque. Keep an explicit input catalog for export, then remove it before adding our overlay.
export const catalogArguments = (args: readonly string[]): { config: string[]; child: string[]; explicit: boolean; cwd?: string } => {
  const config: string[] = [], child: string[] = [], childConfig: string[] = [];
  let explicit = false;
  let cwd: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { child.push(...args.slice(i)); break; }
    if (arg === '-C' || arg === '--cd') { cwd = args[++i]; child.push(arg, cwd ?? ''); continue; }
    if (arg.startsWith('--cd=')) cwd = arg.slice(5);
    else if (/^-C./.test(arg)) cwd = arg.slice(arg[2] === '=' ? 3 : 2);
    let value: string | undefined;
    const original = [arg];
    if (arg === '-c' || arg === '--config') { value = args[++i]; original.push(value ?? ''); }
    else if (arg.startsWith('--config=')) value = arg.slice(9);
    else if (/^-c./.test(arg)) value = arg.slice(arg[2] === '=' ? 3 : 2);
    if (value !== undefined) {
      config.push('-c', value);
      if (value.slice(0, value.indexOf('=')).trim().split('.')[0] === 'model_catalog_json') { explicit = true; continue; }
      childConfig.push('-c', value);
      continue;
    }
    child.push(...original);
  }
  // Codex 0.153.x loses earlier root overrides when -c occurs after a subcommand. Put every
  // override in one root group so ordinary effort/sandbox options cannot drop Wisp's transport.
  return { config, child: [...childConfig, ...child], explicit, ...(cwd ? { cwd } : {}) };
};

export const readNativeCatalog = async (
  codex: { file: string; args: string[] }, args: readonly string[], env: NodeJS.ProcessEnv, timeout = 4000,
): Promise<NativeCatalog> => {
  const { config, explicit, cwd } = catalogArguments(args);
  let raw: string;
  try { raw = await runExport(codex, [...config, 'debug', 'models'], env, timeout, cwd); }
  catch (error) {
    // A malformed/missing input catalog must not quietly become the bundled list. Only a refresh
    // deadline can use the bundled fallback; ordinary export errors need a usable installation/config.
    if (explicit || !(error as { killed?: boolean }).killed) throw new Error('Could not export the Codex catalog. Check the Codex installation and source catalog configuration.');
    raw = await runExport(codex, ['debug', 'models', '--bundled'], env, timeout)
      .catch(() => { throw new Error('Could not export the bundled Codex catalog.'); });
  }
  try { return parseNativeCatalog(JSON.parse(raw)); }
  catch { throw new Error('Invalid Codex catalog: expected complete models with unique, nonempty ids.'); }
};

export const aliasDescriptor = (name: string, description: string, caps: TargetCapabilities = {}): Record<string, unknown> => ({
  slug: name, display_name: name, description,
  default_reasoning_level: caps.defaultEffort && caps.efforts?.includes(caps.defaultEffort) ? caps.defaultEffort : null,
  supported_reasoning_levels: (caps.efforts ?? []).map(effort => ({ effort, description: `${effort} reasoning` })),
  shell_type: 'unified_exec', visibility: 'list', supported_in_api: true, priority: 100,
  additional_speed_tiers: [], service_tiers: [], upgrade: null,
  base_instructions: 'You are a coding assistant. Use the provided tools when appropriate.',
  model_messages: null, include_skills_usage_instructions: true, include_plugin_usage_instructions: true,
  supports_reasoning_summary_parameter: false, default_reasoning_summary: 'none',
  support_verbosity: false, default_verbosity: null, apply_patch_tool_type: 'freeform',
  web_search_tool_type: 'text', truncation_policy: { mode: 'bytes', limit: 10000 },
  supports_image_detail_original: false,
  context_window: Number.isSafeInteger(caps.contextInput) && caps.contextInput! > 0 ? caps.contextInput : null,
  max_context_window: Number.isSafeInteger(caps.contextInput) && caps.contextInput! > 0 ? caps.contextInput : null, auto_compact_token_limit: null,
  effective_context_window_percent: 95, experimental_supported_tools: [], input_modalities: caps.vision ? ['text', 'image'] : ['text'],
  supports_search_tool: false, use_responses_lite: false, tool_mode: 'standard', multi_agent_version: 'v1',
});

export const mergeAliasCatalog = (
  catalog: NativeCatalog, config: WispConfig, capabilities: (target: Target) => TargetCapabilities | undefined,
  providers: Provider[] = PROVIDERS,
): NativeCatalog => {
  const models = new Map(catalog.models.map(m => [m.slug, m]));
  const names = new Set<string>();
  for (const { name, target } of config.routing?.aliases ?? []) {
    const provider = providers.find(p => p.id === target.providerId);
    if (!name.trim() || names.has(name) || providers.some(p => p.id === name) || !provider || !target.model.trim()) {
      throw new Error('Invalid Wisp alias Target or duplicate/shadowed name. Repair the routing map before launching Codex.');
    }
    names.add(name);
    const caps = capabilities(target);
    const label = config.bridge?.aliasPickerShowsModel ? `${provider.label} / ${target.model}` : provider.label;
    models.set(name, aliasDescriptor(name, `Wisp Alias → ${label}. ${caps ? 'Capabilities limited to Target metadata and the Bridge.' : 'Capabilities unknown: text only; no advertised effort or context limit.'}`, caps));
  }
  return { ...catalog, models: [...models.values()] };
};

export const readAliasCapabilities = async (config: WispConfig, auth: WispAuth): Promise<(target: Target) => TargetCapabilities | undefined> => {
  const targets = config.routing?.aliases.map(a => a.target) ?? [];
  const keyed = targets.some(t => PROVIDERS.find(p => p.id === t.providerId)?.catalogKey || ['anthropic', 'xai'].includes(t.providerId));
  const [publicCatalog, codex] = await Promise.all([
    keyed ? getModelsDevCatalog(AbortSignal.timeout(4000)) : undefined,
    targets.some(t => t.providerId === 'codex') ? codexCatalog.get({ creds: auth.codex, baseUrl: PROVIDERS.find(p => p.id === 'codex')!.baseUrl }) : undefined,
  ]);
  return target => {
    const p = PROVIDERS.find(p => p.id === target.providerId);
    if (!p) return undefined;
    if (p.kind === 'codex') {
      const info = codex?.models.find(m => m.id === target.model);
      return info ? { contextInput: info.contextWindow, vision: info.inputModalities?.includes('image'), efforts: codexEffortOptions(info), defaultEffort: info.defaultEffort } : undefined;
    }
    const caps = lookupModelsDevCaps(publicCatalog, p.catalogKey ?? (p.kind === 'anthropic-oauth' ? 'anthropic' : p.kind === 'xai-oauth' ? 'xai' : ''), target.model);
    if (!caps) return undefined;
    const efforts = ['low', 'medium', 'high', 'xhigh', 'max'].filter(effort => p.kind === 'anthropic-oauth'
      ? anthropicThinkingEffort(target.model, effort).output_config?.effort === effort
      : p.kind === 'xai-oauth' && xaiReasoning(target.model, effort)?.effort === effort);
    return { ...caps, vision: p.kind !== 'antigravity-oauth' && p.kind !== 'anthropic-oauth' && caps.vision, efforts };
  };
};

export const writeChildCatalog = (catalog: NativeCatalog): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-codex-catalog-'));
  const path = join(dir, 'models.json');
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try { writeFileSync(path, JSON.stringify(catalog), { encoding: 'utf8', mode: 0o600 }); }
  catch (error) { cleanup(); throw error; }
  return { path, cleanup };
};
