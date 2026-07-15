// ----------------- home.ts — Wisp home store: config/auth schema + migration pures ----------------- //

/*
 * Depends on:
 *   - ./catalog: CodexCreds/AnthropicCreds/XaiCreds/EffortLevel shapes stored in the two files.
 *   - ./routing: the RoutingMap shape stored in config.json.
 *
 * Data shapes:
 *   - WispConfig: parsed ~/.wisp/config.json — Active Provider id, per-Provider model memory,
 *     Effort, Routing map, Custom base URL, Bridge settings. All fields optional; absent = default.
 *   - WispAuth: parsed ~/.wisp/auth.json — per-Provider API keys, the Codex + Anthropic + Grok OAuth
 *     bundles, the Bridge access secret. Owner-only file (ADR-0002).
 *
 * Everything here is pure (no fs) — the I/O layer is homeStore.ts. Parsers are lenient: corrupt
 * input reads as empty, wrong-typed fields are dropped so call-site defaulting applies, and unknown
 * keys are preserved so a TUI-era field survives an extension read-modify-write.
 */

import type { AnthropicCreds, CodexCreds, XaiCreds, EffortLevel } from './catalog';
import type { RoutingMap } from './routing';

// ----------------------------- Types ----------------------------- //

export type WispBridgeSettings = { port?: number; aliasPickerShowsModel?: boolean; aliasOnlyModels?: boolean };

export type WispConfig = {
  provider?: string;
  models?: Record<string, string>;
  effort?: EffortLevel;
  routing?: RoutingMap;
  customBaseUrl?: string;
  bridge?: WispBridgeSettings;
};

export type WispAuth = {
  keys?: Record<string, string>;
  codex?: CodexCreds;
  anthropic?: AnthropicCreds;
  xai?: XaiCreds;
  bridgeSecret?: string;
};

// ----------------------------- effectiveAliasOnly ----------------------------- //

// The one shared read of bridge.aliasOnlyModels (#81): unset resolves to ON at read time — never a
// migration write — so a stored explicit false survives the default flip. Every consumer (Bridge
// list, TUI echo, side-panel checkbox) must read through this fn, not the raw field.
export const effectiveAliasOnly = (cfg: WispConfig): boolean => cfg.bridge?.aliasOnlyModels ?? true;

// ----------------------------- Parse helpers ----------------------------- //

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// JSON text → plain object, or undefined for anything unusable (corrupt, non-object, empty).
const parseObject = (raw: string | undefined | null): Record<string, unknown> | undefined => {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch { return undefined; }
};

// Keep only string-valued entries — one bad entry must not sink the whole map.
const stringRecord = (v: unknown): Record<string, string> | undefined => {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([, val]) => typeof val === 'string')) as Record<string, string>;
};

const EFFORT_VALUES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

// Keep only correctly-typed known creds fields — a hand-edited bundle must never flow a number into a
// Bearer header or a string into an expiry compare. An empty result is still a valid tombstone.
const sanitizeCreds = (v: unknown, fields: Record<string, 'string' | 'number'>): Record<string, unknown> | undefined => {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([k, val]) => fields[k] && typeof val === fields[k]));
};

const CODEX_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', idToken: 'string', accountId: 'string', apiKey: 'string' } as const;
const ANTHROPIC_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', expiresAt: 'number' } as const;
const XAI_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', expiresAt: 'number', tokenEndpoint: 'string' } as const;

// ----------------------------- parseWispConfig ----------------------------- //

// Parse config.json text. Field-level guards drop wrong-typed values (downstream defaulting takes
// over); unknown keys pass through untouched.
export const parseWispConfig = (raw: string | undefined | null): WispConfig => {
  const obj = parseObject(raw);
  if (!obj) return {};
  const cfg: Record<string, unknown> = { ...obj };

  if ('provider' in cfg && typeof cfg.provider !== 'string') delete cfg.provider;
  if ('models' in cfg) {
    const models = stringRecord(cfg.models);
    if (models) cfg.models = models; else delete cfg.models;
  }
  if ('effort' in cfg && !(typeof cfg.effort === 'string' && EFFORT_VALUES.has(cfg.effort))) delete cfg.effort;
  if ('routing' in cfg) {
    const r = cfg.routing;
    if (!(isRecord(r) && isRecord(r.families) && Array.isArray(r.aliases))) delete cfg.routing;
  }
  if ('customBaseUrl' in cfg && typeof cfg.customBaseUrl !== 'string') delete cfg.customBaseUrl;
  if ('bridge' in cfg) {
    if (isRecord(cfg.bridge)) {
      const bridge: WispBridgeSettings = { ...cfg.bridge };
      if ('port' in bridge && typeof bridge.port !== 'number') delete bridge.port;
      if ('aliasPickerShowsModel' in bridge && typeof bridge.aliasPickerShowsModel !== 'boolean') delete bridge.aliasPickerShowsModel;
      if ('aliasOnlyModels' in bridge && typeof bridge.aliasOnlyModels !== 'boolean') delete bridge.aliasOnlyModels;
      cfg.bridge = bridge;
    } else delete cfg.bridge;
  }
  return cfg as WispConfig;
};

// ----------------------------- parseWispAuth ----------------------------- //

// Parse auth.json text. An empty creds object is kept — it is the signed-out tombstone that
// suppresses the CLI auth.json re-import, not garbage.
export const parseWispAuth = (raw: string | undefined | null): WispAuth => {
  const obj = parseObject(raw);
  if (!obj) return {};
  const auth: Record<string, unknown> = { ...obj };

  if ('keys' in auth) {
    const keys = stringRecord(auth.keys);
    if (keys) auth.keys = keys; else delete auth.keys;
  }
  if ('codex' in auth) {
    const codex = sanitizeCreds(auth.codex, CODEX_CRED_FIELDS);
    if (codex) auth.codex = codex; else delete auth.codex;
  }
  if ('anthropic' in auth) {
    const anthropic = sanitizeCreds(auth.anthropic, ANTHROPIC_CRED_FIELDS);
    if (anthropic) auth.anthropic = anthropic; else delete auth.anthropic;
  }
  if ('xai' in auth) {
    const xai = sanitizeCreds(auth.xai, XAI_CRED_FIELDS);
    if (xai) auth.xai = xai; else delete auth.xai;
  }
  if ('bridgeSecret' in auth && typeof auth.bridgeSecret !== 'string') delete auth.bridgeSecret;
  return auth as WispAuth;
};

// ----------------------------- serializeWispStore ----------------------------- //

// Both store files are hand-editable — pretty two-space JSON with a trailing newline.
export const serializeWispStore = (value: object): string => `${JSON.stringify(value, null, 2)}\n`;

// ----------------------------- planSecretsMigration ----------------------------- //

// What the extension found in SecretStorage, already read out: per-Provider keys plus the raw
// OAuth-bundle JSON blobs and the Bridge secret.
export type SecretSlots = {
  keys: Record<string, string>;
  codexRaw?: string;
  anthropicRaw?: string;
  bridgeSecret?: string;
};

// The one-time SecretStorage→auth.json mapping (ADR-0002). Slot values fill only ABSENT auth fields
// — auth.json is already the source of truth, so an existing value is never clobbered by a stale
// slot. Returns the merged auth to write, or null when the slots hold nothing usable (so a second
// launch, after the caller deletes the slots, is a no-op). Corrupt creds JSON and blank keys are
// dropped, not copied.
export const planSecretsMigration = ({ auth, slots }: { auth: WispAuth; slots: SecretSlots }): WispAuth | null => {
  const keys = Object.fromEntries(Object.entries(slots.keys).filter(([, v]) => v.trim()));
  const codex = parseObject(slots.codexRaw) as CodexCreds | undefined;
  const anthropic = parseObject(slots.anthropicRaw) as AnthropicCreds | undefined;
  const bridgeSecret = slots.bridgeSecret?.trim() || undefined;
  if (Object.keys(keys).length === 0 && !codex && !anthropic && !bridgeSecret) return null;

  const next: WispAuth = { ...auth };
  const mergedKeys = { ...keys, ...auth.keys };
  if (Object.keys(mergedKeys).length > 0) next.keys = mergedKeys;
  if (codex && !auth.codex) next.codex = codex;
  if (anthropic && !auth.anthropic) next.anthropic = anthropic;
  if (bridgeSecret && !auth.bridgeSecret) next.bridgeSecret = bridgeSecret;
  return next;
};

// ----------------------------- seedConfigFromVsCode ----------------------------- //

// Everything config-shaped the extension can read from its old homes (settings + globalState),
// flattened for the seed mapping below.
export type VsCodeConfigSnapshot = {
  provider?: string;
  models?: Record<string, string>;
  effort?: EffortLevel;
  routing?: RoutingMap;
  customBaseUrl?: string;
  bridgePort?: number;
  aliasPickerShowsModel?: boolean;
};

// First-run seed: map the old VS Code state onto a fresh config.json. Undefined fields are omitted
// entirely so a fresh install seeds {} and file defaults stay visible as absence.
export const seedConfigFromVsCode = (snap: VsCodeConfigSnapshot): WispConfig => {
  const cfg: WispConfig = {};
  if (snap.provider !== undefined) cfg.provider = snap.provider;
  if (snap.models !== undefined) cfg.models = snap.models;
  if (snap.effort !== undefined) cfg.effort = snap.effort;
  if (snap.routing !== undefined) cfg.routing = snap.routing;
  if (snap.customBaseUrl !== undefined) cfg.customBaseUrl = snap.customBaseUrl;
  const bridge: WispBridgeSettings = {};
  if (snap.bridgePort !== undefined) bridge.port = snap.bridgePort;
  if (snap.aliasPickerShowsModel !== undefined) bridge.aliasPickerShowsModel = snap.aliasPickerShowsModel;
  if (Object.keys(bridge).length > 0) cfg.bridge = bridge;
  return cfg;
};
