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

import type { AnthropicCreds, CodexCreds, XaiCreds, KimiCreds, AntigravityCreds, EffortLevel } from './catalog';
import type { RoutingMap, SnapshotEntry, SnapshotStore } from './routing';
import { validateCodexRoutes } from './routing';

// ----------------------------- Types ----------------------------- //

export type WispBridgeSettings = { port?: number; aliasPickerShowsModel?: boolean; aliasOnlyModels?: boolean };

export type WispConfig = {
  provider?: string;
  models?: Record<string, string>;
  effort?: EffortLevel;
  routing?: RoutingMap;
  snapshots?: SnapshotStore;
  customBaseUrl?: string;
  bridge?: WispBridgeSettings;
};

export type WispAuth = {
  keys?: Record<string, string>;
  codex?: CodexCreds;
  anthropic?: AnthropicCreds;
  xai?: XaiCreds;
  kimi?: KimiCreds;
  antigravity?: AntigravityCreds;
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
//
// The BOM strip is load-bearing, not cosmetic (#181). A UTF-8 BOM is valid UTF-8 and is what Notepad and
// PowerShell 5.1's `Out-File`/`Set-Content -Encoding utf8` prepend by default, so a hand-edited store
// arrives with one routinely — but JSON.parse rejects it, which read a perfectly good file as corrupt.
// That verdict is destructive here rather than merely lossy: both stores are read-merge-write, so the
// {} this returned was merged with the next patch and written back, erasing the user's real config (every
// family route) or auth (every API key and OAuth bundle) from disk on their next settings change or sign-in.
const parseObject = (raw: string | undefined | null): Record<string, unknown> | undefined => {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw.replace(/^﻿/, ''));
    return isRecord(parsed) ? parsed : undefined;
  } catch { return undefined; }
};

// Does this raw text hold something we FAILED to understand? (#182)
//
// The parsers above flatten two very different situations into the same `{}`: "there is nothing here"
// (absent, empty, whitespace) and "there is something here and we could not read it" (truncated write,
// hand-edit typo, valid JSON that is not an object). Reading them alike is fine. Writing them alike is the
// data loss — the store layer merges that `{}` with the next patch and puts it back over the file, so the
// second case erases contents we already admitted we did not understand. This is the bit the parsers throw
// away, kept as its own pure predicate so `homeStore.merge` can refuse exactly that case and nothing else.
export const isUnusableStore = (raw: string | undefined | null): boolean =>
  !!raw?.trim() && parseObject(raw) === undefined;

// Keep only string-valued entries — one bad entry must not sink the whole map.
const stringRecord = (v: unknown): Record<string, string> | undefined => {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([, val]) => typeof val === 'string')) as Record<string, string>;
};

// A snapshot entry is null (row was unset) or a well-formed Target; drop any other shape so one
// hand-edited entry can't flow garbage into revert. Non-record input drops the whole field.
const snapshotStore = (v: unknown): SnapshotStore | undefined => {
  if (!isRecord(v)) return undefined;
  const entries: Array<[string, SnapshotEntry]> = [];
  for (const [row, val] of Object.entries(v)) {
    if (val === null) entries.push([row, null]);
    else if (isRecord(val) && typeof val.providerId === 'string' && typeof val.model === 'string') {
      entries.push([row, { providerId: val.providerId, model: val.model }]);
    }
  }
  // Object.fromEntries writes own properties — a hand-edited '__proto__' key lands as data, not a
  // prototype set, so it can't smuggle inherited garbage past the shallow read into revert.
  return Object.fromEntries(entries);
};

// Provider metadata validates support at selection/send time. Persist future Codex effort names too.
const validEffort = (v: unknown): boolean => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(v);

// Keep only correctly-typed known creds fields — a hand-edited bundle must never flow a number into a
// Bearer header or a string into an expiry compare. An empty result is still a valid tombstone.
const sanitizeCreds = (v: unknown, fields: Record<string, 'string' | 'number'>): Record<string, unknown> | undefined => {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([k, val]) => fields[k] && typeof val === fields[k]));
};

const CODEX_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', idToken: 'string', accountId: 'string', apiKey: 'string' } as const;
const ANTHROPIC_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', expiresAt: 'number', deviceId: 'string', accountUuid: 'string', accountEmail: 'string', organizationName: 'string', rateLimitTier: 'string' } as const;
const XAI_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', expiresAt: 'number', tokenEndpoint: 'string' } as const;
const KIMI_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', expiresAt: 'number' } as const;
// #188: projectId is the one field no other kind has — the Cloud Code project every envelope carries. The
// allowlist is also what keeps the reference's per-email `accounts` map out: spec #185 stores ONE account.
const ANTIGRAVITY_CRED_FIELDS = { accessToken: 'string', refreshToken: 'string', expiresAt: 'number', projectId: 'string' } as const;

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
  if ('effort' in cfg && !validEffort(cfg.effort)) delete cfg.effort;
  if ('routing' in cfg) {
    const r = cfg.routing;
    if (isRecord(r)) validateCodexRoutes(r.codexModels);
    if (!(isRecord(r) && isRecord(r.families) && Array.isArray(r.aliases))) {
      if (isRecord(r) && 'codexModels' in r) throw new Error('Invalid routing: Codex routes require families and aliases containers. Repair config.json.');
      delete cfg.routing;
    }
  }
  if ('snapshots' in cfg) {
    const cleaned = snapshotStore(cfg.snapshots);
    if (cleaned) cfg.snapshots = cleaned; else delete cfg.snapshots;
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
  if ('kimi' in auth) {
    const kimi = sanitizeCreds(auth.kimi, KIMI_CRED_FIELDS);
    if (kimi) auth.kimi = kimi; else delete auth.kimi;
  }
  if ('antigravity' in auth) {
    const antigravity = sanitizeCreds(auth.antigravity, ANTIGRAVITY_CRED_FIELDS);
    if (antigravity) auth.antigravity = antigravity; else delete auth.antigravity;
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
