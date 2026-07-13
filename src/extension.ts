// ----------------- extension.ts — Wisp: Inquire inline editor ----------------- //

/*
 * Depends on:
 *   - vscode: editor host API — registers the Inquire command, reads settings, stores the key
 *     in the OS keychain (SecretStorage), drives the status-bar indicator and the cancellation token.
 *   - openai: OpenAI-compatible client, pointed at the Active Provider's base URL — the exact pattern
 *     used by the reference llm-provider (`new OpenAI({ apiKey, baseURL })` → chat.completions.create).
 *   - ./sidePanelProvider: the side-panel webview. It receives the shared action helpers below
 *     (storeApiKey/clearApiKey/fetchModelIds/setModel/setProvider/setBaseUrl/getState) so panel and
 *     commands drive the exact same logic.
 *   - ./catalog: vscode-free Provider-catalog data + the Inquire edit-prompt/reply helpers.
 *
 * Design decisions (settled in design review): chat-as-editor over the whole file (one confirmable
 * WorkspaceEdit replace, add and delete in one shot), non-streaming, key in SecretStorage (env-var
 * fallback), a per-Provider model memory, and a status-bar heartbeat because latency is user-visible.
 */

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import OpenAI from 'openai';
import { NO_KEY_MESSAGE, WispPanelProvider, PanelState } from './sidePanelProvider';
import {
  Provider, CUSTOM_ID, resolveModel, resolveBaseUrl, resolveKeyId, planLegacyMigration, planZenToGoMigration,
  buildEditPrompt, parseEditBlocks, applyEditBlocks, diffLines, isCodexProvider, isCodexSignedIn, codexModelsFrom, DEFAULT_EFFORT,
  isAnthropicProvider, isAnthropicSignedIn, anthropicModelsFrom, standardEffortToCodex, effortOptionsFor,
  type CodexCreds, type EffortLevel, type AnthropicCreds,
} from './catalog';
import { getModelsDevCatalog } from './modelsDev';
import { EMPTY_ROUTING_MAP, type RoutingMap, type FamilyKey, type Target } from './routing';
import { registerWispChatProvider } from './chatProvider';
import { createBridgeServer } from './bridgeServer';
import { buildClaudeCodeSnippets, ClaudeCodeSnippets } from './bridgeAnthropic';
import { CodexAuth } from './codexAuth';
import { codexInquire } from './codexClient';
import { AnthropicAuth } from './anthropicAuth';
import { anthropicInquire } from './anthropicClient';

// ----------------------------- Constants ----------------------------- //

const CONFIG_NS = 'wisp';
// Legacy (pre-catalog) keychain slot. Per-Provider keys now live in `${SECRET_KEY}.<id>` slots;
// this bare name is read once by migrateLegacyKey() then deleted. Not a literal key.
const SECRET_KEY = 'wisp.apiKey';

// SecretStorage slot for the Bridge access secret — the Bearer the listener requires on every request.
// Generated once on first start (never in plaintext settings) then reused, so a configured CLI stays valid.
const BRIDGE_SECRET_SLOT = 'wisp.bridge.secret';
// Default Bridge port (overridable via wisp.bridge.port) — a fixed high port unlikely to clash.
const DEFAULT_BRIDGE_PORT = 41184;

// ----------------------------- Provider catalog ----------------------------- //

// A Provider is one OpenAI-chat-compatible backend, reached by swapping {baseUrl, key, model} on the
// same `openai` SDK. Base URLs are HARDCODED here, never read from settings: choosing a Provider
// chooses where the bearer key is sent, so a workspace-overridable URL would be a key-redirect vector.
// The catalog is the ten built-ins below (OpenCode Go default) plus a user-defined Custom row whose
// base URL alone comes from settings (machine-scoped wisp.baseUrl). No model-id transform — each
// defaultModel is in the Provider's native form (re-adding Zen's `opencode/` prefix 401s the /go
// endpoint, which wants the bare id /models serves). GitHub Copilot and Cursor are deliberately
// absent (ban risk / shape-incompatible — see the 2026-06-15 multi-provider ADR + gotchas).
// defaultModel for the first five is doc-verified and ollama-cloud is user-verified (2026-06-16); the
// three still marked ⚠ are BEST-EFFORT presets — no key was available to verify them against each GET
// /models, so the panel's model picker / type-field is the correction path. ⚠ Ollama Cloud is `/v1`,
// NOT `/api/v1` (the `/api` prefix is Ollama's native protocol and breaks the OpenAI SDK — see gotchas.md).
// Chat-surface context windows and vision are read LIVE for the active model from models.dev (via each
// row's catalogKey). Fallback when a model isn't in models.dev or the fetch fails: context = a neutral
// default (no guess table); vision = the conservative modelSupportsVision id heuristic.
const PROVIDERS: Provider[] = [
  { id: 'opencode-go', label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY', catalogKey: 'opencode-go' },
  // OpenCode Zen = the premium /zen/v1 catalog (Claude/GPT/Gemini), distinct from Go's budget /zen/go/v1.
  // Shares the OPENCODE_API_KEY env fallback. Model ids are BARE (verified via GET /zen/v1/models,
  // 2026-06-18) — no `opencode/` prefix. defaultModel is ⚠ best-effort: claude-haiku-4-5 is the cheapest
  // verified-present model; the panel's model picker is the correction path. catalogKey 'opencode' for
  // models.dev context/vision (absent there -> neutral default + the modelSupportsVision id heuristic).
  // keyId 'opencode-go': same OpenCode account as Go (one key, two endpoints), so it borrows Go's stored
  // key instead of demanding a second entry — otherwise it stays hidden from the picker until re-keyed.
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', defaultModel: 'claude-haiku-4-5', apiKeyEnv: 'OPENCODE_API_KEY', catalogKey: 'opencode', keyId: 'opencode-go' },
  // Codex = the subscription-backed ChatGPT Codex backend (Responses API, reached by OAuth, not an API
  // key). kind:'codex' switches the Inquire/usability paths off the OpenAI-chat code. No apiKeyEnv — it
  // is "usable when signed in". Base URL is the Codex backend; defaultModel is the Codex-tuned default.
  // No catalogKey (not in models.dev) and it is intentionally absent from the native chat picker until
  // the Responses tool-mapper lands (#15) — keyless rows are hidden there, which is correct for now.
  { id: 'codex', label: 'Codex', baseUrl: 'https://chatgpt.com/backend-api/codex', defaultModel: 'gpt-5.3-codex', apiKeyEnv: '', kind: 'codex' },
  // Anthropic = the subscription-backed Claude backend (Messages API, reached by Claude.ai OAuth, not an
  // API key). kind:'anthropic-oauth' switches the Inquire/usability paths off the OpenAI-chat code, like
  // Codex. No apiKeyEnv — "usable when signed in". Base URL is api.anthropic.com (the client appends
  // /v1/messages); defaultModel is the latest Opus. No catalogKey (not in models.dev) and absent from the
  // native chat picker until the Messages adapter lands (slice #29) — keyless rows are hidden there.
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-opus-4-8', apiKeyEnv: '', kind: 'anthropic-oauth' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', apiKeyEnv: 'OPENAI_API_KEY', catalogKey: 'openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY', catalogKey: 'groq' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'codestral-latest', apiKeyEnv: 'MISTRAL_API_KEY', catalogKey: 'mistral' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', apiKeyEnv: 'OPENROUTER_API_KEY', catalogKey: 'openrouter' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen2.5-coder' /* ⚠ best-effort: user must have pulled it */, apiKeyEnv: '' /* local models aren't in models.dev → table/default */ },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', defaultModel: 'gpt-oss:120b' /* verified working 2026-06-16 */, apiKeyEnv: 'OLLAMA_API_KEY', catalogKey: 'ollama-cloud' },
  { id: 'kilocode', label: 'KiloCode', baseUrl: 'https://api.kilo.ai/api/gateway', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify namespace via /models */, apiKeyEnv: 'KILOCODE_API_KEY', catalogKey: 'kilo' },
  { id: 'cline', label: 'Cline', baseUrl: 'https://api.cline.bot/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify via /models */, apiKeyEnv: 'CLINE_API_KEY' /* not in models.dev → table/default */ },
  // Custom: the always-works escape hatch and the only Provider whose base URL + model are
  // user-supplied (machine-scoped wisp.baseUrl + a typed model, resolved at runtime by
  // activeBaseUrl()). No env fallback — its key lives only in the wisp.apiKey.custom slot.
  { id: 'custom', label: 'Custom', baseUrl: '', defaultModel: '', apiKeyEnv: '' },
];

// globalState key for the per-Provider model memory: { providerId: model }.
const MODEL_MAP_KEY = 'wisp.models';
// globalState key for the Codex reasoning Effort — one global value (not per-model), same store as models.
const EFFORT_KEY = 'wisp.effort';
// globalState key for the Bridge Routing map (#51): { families, aliases } — read live per Bridge request.
const ROUTING_MAP_KEY = 'wisp.routingMap';

// ----------------------------- Module state ----------------------------- //

let output: vscode.OutputChannel;
let secrets: vscode.SecretStorage;
let globalState: vscode.Memento; // per-Provider model memory ({ providerId: model }) lives here
let statusBar: vscode.StatusBarItem;

// Reuse one client; rebuild only when key/baseURL change (construction is local, no network).
let cachedClient: { key: string; baseURL: string; client: OpenAI } | undefined;

// Status-bar heartbeat state: number of requests on the wire, and whether the last one failed.
let inFlight = 0;
let lastError = false;

// Side panel handle so key/config changes can push fresh state into the webview.
let panel: WispPanelProvider | undefined;

// Codex OAuth/token lifecycle (sign-in, store, import, refresh). Set in activate once SecretStorage
// exists; the Inquire codex branch + the sign-in/out commands + the panel state all go through it.
let codexAuth: CodexAuth;

// Anthropic (Claude.ai) OAuth/token lifecycle — same role as codexAuth for the kind:'anthropic-oauth' row.
let anthropicAuth: AnthropicAuth;

// The Bridge listener handle — created in activate, started/stopped by the command AND the panel switch. OFF
// until toggled on (PRD: no local port open until the user deliberately enables it).
let bridge: ReturnType<typeof createBridgeServer>;
// The Bridge access secret, held in memory only while the Bridge runs (the listener reads it sync per
// request, so it can't await SecretStorage). Loaded/generated on start, cleared to '' on stop.
let bridgeSecret = '';
// VS Code's env-var collection — terminals opened after start inherit the COPILOT_* BYOK vars (#35 finding),
// pointing the Copilot CLI at the live Bridge with no user setup; cleared on stop.
let envCollection: vscode.EnvironmentVariableCollection;

// B2 inline-diff state. While a preview is on screen the buffer holds old+new lines together
// (decorated), and exactly one preview is live at a time. `range` covers the rendered preview text;
// Accept replaces it with `acceptText` (kept+added), Reject restores `originalText` (the span).
let addedDecoration: vscode.TextEditorDecorationType;
let removedDecoration: vscode.TextEditorDecorationType;
let activePreview: { uri: vscode.Uri; range: vscode.Range; lensLine: number; acceptText: string; originalText: string } | undefined;
// CodeLens refresh signal — fired when a preview appears or resolves so the Accept/Reject lenses
// re-evaluate against the new activePreview.
const onDidChangeCodeLenses = new vscode.EventEmitter<void>();

// ----------------------------- Configuration ----------------------------- //

const cfg = () => vscode.workspace.getConfiguration(CONFIG_NS);

// The Active Provider is the source of truth. Read wisp.provider; an unknown id falls back to the
// default row (PROVIDERS[0]) so a stale/typo'd setting can never leave us provider-less.
const activeProvider = (): Provider =>
  PROVIDERS.find((p) => p.id === cfg().get<string>('provider')) ?? PROVIDERS[0];

// SecretStorage slot for a Provider's key: `wisp.apiKey.<id>` (the bare SECRET_KEY is the
// pre-catalog legacy slot, migrated once on activate).
const keySlot = (id: string): string => `${SECRET_KEY}.${id}`;

// The slot a Provider's key lives in — its own, unless it borrows a sibling's via keyId (OpenCode Zen
// reads/writes Go's slot). All key get/store/delete/display routes through this so a shared credential
// stays single-sourced.
const keySlotFor = (p: Provider): string => keySlot(resolveKeyId(p));

// Active model: the Provider's remembered model (globalState) else its native default. Each Provider
// keeps its own model — one global id is wrong across Providers (Zen minimax-m3 vs Groq llama-…).
const activeModel = (): string =>
  resolveModel(globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {}, activeProvider());

// The reasoning Effort — one global value (globalState), defaulting to medium so existing behavior is
// unchanged. Shared by Codex + Anthropic; ignored by every keyed Provider. Stored as the wider EffortLevel
// (#32 'max'); each send site normalizes (standardEffortToCodex for Codex, the clamp for Anthropic).
const activeEffort = (): EffortLevel => globalState.get<EffortLevel>(EFFORT_KEY) ?? DEFAULT_EFFORT;

// The Bridge Routing map (globalState) — empty (everything → Active Provider) until the panel sets rows.
const activeRoutingMap = (): RoutingMap => globalState.get<RoutingMap>(ROUTING_MAP_KEY) ?? EMPTY_ROUTING_MAP;

// Base URL for the Active Provider. Built-ins use their hardcoded catalog URL; only Custom reads the
// user-supplied, machine-scoped wisp.baseUrl (every built-in ignores that setting entirely).
const activeBaseUrl = (): string => resolveBaseUrl(activeProvider(), cfg().get<string>('baseUrl') ?? '');

// The Bridge listen port — wisp.bridge.port, or the fixed default when unset.
const bridgePort = (): number => cfg().get<number>('bridge.port') ?? DEFAULT_BRIDGE_PORT;

// Key resolution for a given Provider: its (possibly borrowed, via keyId) SecretStorage slot first,
// then the row's own env var (OPENCODE_API_KEY for OpenCode, GROQ_API_KEY for Groq, …). Never read from
// plaintext settings. Takes the Provider explicitly so the chat surface can resolve any catalog row, not
// only the Active one.
const keyForProvider = async (p: Provider): Promise<string> => {
  const stored = await secrets.get(keySlotFor(p));
  return stored?.trim() || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : '') || '';
};

// The Active Provider's key — Inquire's path. Thin delegate so there is one key-resolution rule.
const resolveApiKey = (): Promise<string> => keyForProvider(activeProvider());

// Build a fresh client for an arbitrary Provider (the chat surface picks per-request, so the Active
// Provider's cachedClient doesn't apply). Returns undefined when the Provider has no key, or is Custom
// with no base URL — i.e. nothing to send to. Construction is local (no network), so per-call is fine.
const clientForProvider = async (p: Provider): Promise<OpenAI | undefined> => {
  const key = await keyForProvider(p);
  if (!key) return undefined;
  const baseURL = resolveBaseUrl(p, cfg().get<string>('baseUrl') ?? '');
  if (!baseURL) return undefined;
  return new OpenAI({ apiKey: key, baseURL });
};

// Build (and cache) the client from the Active Provider's resolved {baseUrl, key}. Base URL is the
// catalog row's (or Custom's wisp.baseUrl) — switching Provider, its key, or that URL rebuilds it.
const getClient = async (): Promise<OpenAI | undefined> => {
  const key = await resolveApiKey();
  if (!key) return undefined;
  const baseURL = activeBaseUrl();
  if (!cachedClient || cachedClient.key !== key || cachedClient.baseURL !== baseURL) {
    cachedClient = { key, baseURL, client: new OpenAI({ apiKey: key, baseURL }) };
  }
  return cachedClient.client;
};

// ----------------------------- Status bar ----------------------------- //

// Reflect current state in the status bar: thinking / error / ready. Latency is user-visible in
// Inquire, so a heartbeat is the difference between "working" and "frozen".
const renderStatus = (): void => {
  if (!statusBar) return;
  if (inFlight > 0) {
    statusBar.text = '$(sync~spin) Wisp';
    statusBar.tooltip = 'Wisp: thinking…';
  } else if (lastError) {
    statusBar.text = '$(error) Wisp';
    statusBar.tooltip = 'Wisp: last request failed — see the Wisp output channel';
  } else {
    statusBar.text = '$(sparkle) Wisp';
    statusBar.tooltip = 'Wisp: ready';
  }
};

// Status bar and side panel are two surfaces of the same Activity — push to both on every
// transition. postActivity no-ops when the panel view is closed.
const enterInFlight = () => { inFlight++; renderStatus(); panel?.postActivity(inFlight > 0); };
const exitInFlight = () => { inFlight = Math.max(0, inFlight - 1); renderStatus(); panel?.postActivity(inFlight > 0); };

// ----------------------------- Shared actions ----------------------------- //

// Single source of truth for key/model/provider mutations — the Command Palette commands and the
// side panel both call these, so the two surfaces can never drift apart.

// Panel sync after key changes happens via the secrets.onDidChange listener in activate() —
// it fires for our own store/delete too, and for changes made from other VS Code windows.
const storeApiKey = async (value: string): Promise<void> => {
  await secrets.store(keySlotFor(activeProvider()), value.trim());
  cachedClient = undefined;
};

const clearApiKey = async (): Promise<void> => {
  await secrets.delete(keySlotFor(activeProvider()));
  cachedClient = undefined;
};

// Probe GET <baseUrl>/models for the ids the endpoint actually serves. Return them exactly
// as served (bare, e.g. "minimax-m3") — the /go chat endpoint rejects a provider-prefixed id,
// so the selectable ids must match the served form to be usable.
const fetchModelIds = async (): Promise<string[]> => {
  const client = await getClient();
  if (!client) throw new Error(NO_KEY_MESSAGE);
  const page = await client.models.list();
  return page.data.map((m) => m.id).sort();
};

// Write to the narrowest scope that already defines the value — a Global write under a
// workspace override changes nothing effective and the panel controls would just snap back.
const targetFor = (key: string): vscode.ConfigurationTarget => {
  const info = cfg().inspect(key);
  if (info?.workspaceFolderValue !== undefined) return vscode.ConfigurationTarget.WorkspaceFolder;
  if (info?.workspaceValue !== undefined) return vscode.ConfigurationTarget.Workspace;
  return vscode.ConfigurationTarget.Global;
};

// Remember the chosen model under the Active Provider (globalState), then mirror it into wisp.model
// (the config write re-syncs the panel and rebuilds the client via onDidChangeConfiguration).
const setModel = async (id: string): Promise<void> => {
  const p = activeProvider();
  await globalState.update(MODEL_MAP_KEY, { ...(globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {}), [p.id]: id });
  await cfg().update('model', id, targetFor('model'));
};

// Persist the Codex reasoning Effort (one global value in globalState). Unlike setModel — which mirrors
// into wisp.model and rides the config-change listener back to the panel — a globalState write fires NO
// config event, so re-push the panel state explicitly or the select would not reflect the change.
const setEffort = async (effort: EffortLevel): Promise<void> => {
  await globalState.update(EFFORT_KEY, effort);
  void panel?.postState();
};

// Set or clear one Family route (#51). Same globalState-write pattern as setEffort: no config event
// fires, so re-push the panel state explicitly. The Bridge reads the map live per request — the next
// call picks the change up with no restart.
const setFamilyRoute = async (family: FamilyKey, target: Target | undefined): Promise<void> => {
  // Only catalog Providers may be a Target — a malformed webview message can't persist a dangling id.
  if (target && !PROVIDERS.some((p) => p.id === target.providerId)) return;
  const map = activeRoutingMap();
  await globalState.update(ROUTING_MAP_KEY, { ...map, families: { ...map.families, [family]: target } });
  void panel?.postState();
};

// Add or retarget one Alias row (#52). Upsert by exact name; same live-read globalState pattern as
// setFamilyRoute. The webview shows the collision message — this guard is the trust boundary that keeps
// a bypassed/malformed message from persisting an alias that shadows a Provider id (the resolver checks
// ids first, so a shadowing alias would be silently unreachable).
const setAlias = async (name: string, target: Target): Promise<void> => {
  if (!name || PROVIDERS.some((p) => p.id === name)) return;
  if (!PROVIDERS.some((p) => p.id === target.providerId)) return;
  const map = activeRoutingMap();
  const rest = map.aliases.filter((a) => a.name !== name);
  await globalState.update(ROUTING_MAP_KEY, { ...map, aliases: [...rest, { name, target }] });
  void panel?.postState();
};

// Panel toggle for the alias picker rows' model-id suffix (#52). A plain config write — the wisp.*
// config listener re-pushes the panel state, and the Bridge reads the setting live per list request.
const setAliasPickerShowsModel = async (on: boolean): Promise<void> => {
  await cfg().update('bridge.aliasPickerShowsModel', on, targetFor('bridge.aliasPickerShowsModel'));
};

// Remove one Alias row by name (#52). Unknown names are a no-op.
const removeAlias = async (name: string): Promise<void> => {
  const map = activeRoutingMap();
  await globalState.update(ROUTING_MAP_KEY, { ...map, aliases: map.aliases.filter((a) => a.name !== name) });
  void panel?.postState();
};

// Keep wisp.model honestly reflecting the Active Provider's model after a raw wisp.provider edit
// (the panel has no part in Issue 4). Guarded against a write-loop: writes only when stale.
const mirrorActiveModel = async (): Promise<void> => {
  const m = activeModel();
  if (cfg().get<string>('model') !== m) await cfg().update('model', m, targetFor('model'));
};

// Switch the Active Provider. Machine-scoped write — selecting a Provider selects where the bearer
// key is sent. The config listener does the rest (invalidate client, re-mirror wisp.model, postState).
const setProvider = async (id: string): Promise<void> => {
  await cfg().update('provider', id, targetFor('provider'));
  cachedClient = undefined;
};

// Custom's base URL (machine-scoped — same key-redirect threat as the Provider selector). Built-ins
// ignore wisp.baseUrl; only Custom resolves from it (activeBaseUrl). The config listener rebuilds.
const setBaseUrl = async (url: string): Promise<void> => {
  await cfg().update('baseUrl', url, targetFor('baseUrl'));
  cachedClient = undefined;
};

// Everything the panel is allowed to know — key presence and source only, never the key itself.
// keySource keeps the UI honest when the key comes from the env var (Clear can't remove that).
const getState = async (): Promise<PanelState> => {
  const p = activeProvider();
  const stored = (await secrets.get(keySlotFor(p)))?.trim();
  const keySource = stored ? 'stored' : p.apiKeyEnv && process.env[p.apiKeyEnv] ? 'env' : 'none';
  // The OAuth Providers (Codex, Anthropic) have no API key — the panel shows sign-in state instead.
  const signedIn = isCodexProvider(p) ? await codexAuth.isSignedIn()
    : isAnthropicProvider(p) ? await anthropicAuth.isSignedIn()
    : false;
  // The OAuth dropdowns are models.dev-sourced — race the cached fetch against a short timeout (same
  // pattern as chatProvider) so a cold/slow models.dev can never stall panel open; undefined → curated
  // fallback inside the *ModelsFrom pures. Skipped entirely for the API-key kinds (live /models instead).
  const catalog = isCodexProvider(p) || isAnthropicProvider(p)
    ? await Promise.race([
        getModelsDevCatalog(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
      ])
    : undefined;
  return {
    keyIsSet: keySource !== 'none',
    keySource,
    keyEnv: p.apiKeyEnv, // shown in the env-key hint so it names the active Provider's var, not Zen's
    model: activeModel(),
    baseUrl: activeBaseUrl(),
    providerId: p.id,
    providers: PROVIDERS.map((r) => ({ id: r.id, label: r.label })), // drives the panel dropdown
    isCustom: p.id === CUSTOM_ID,
    kind: p.kind ?? 'openai-chat',
    signedIn,
    // The OAuth Providers have no /models route — their dropdown comes from models.dev (curated fallback).
    modelOptions: isCodexProvider(p) ? codexModelsFrom(catalog) : isAnthropicProvider(p) ? anthropicModelsFrom(catalog) : undefined,
    // The reasoning-effort knob's current value (drives the panel's Effort select). Shared by the two
    // effort-aware OAuth Providers — Codex and Anthropic (#31); every other Provider leaves it undefined.
    effort: isCodexProvider(p) || isAnthropicProvider(p) ? activeEffort() : undefined,
    // The option list backing that select — Anthropic shows the full low→max ladder (the wire clamps per
    // model), Codex stops at xhigh; mirrors the first-party /effort slider (#32).
    effortOptions: isCodexProvider(p) || isAnthropicProvider(p) ? effortOptionsFor(p) : undefined,
    // Bridge surface: the running/stopped indicator + the address/secret the user copies into the CLI. The
    // secret crosses the boundary only while running (it's the Bridge's own localhost secret, meant to be
    // copied — not a Provider key); '' in memory while stopped, so it stays hidden then.
    bridgeRunning: bridge.isRunning(),
    bridgeAddress: bridgeAddress(),
    bridgeSecret: bridge.isRunning() ? bridgeSecret : undefined,
    // The Routing map's four Family rows (#51) + Alias rows (#52) — drive the panel's routing section.
    routingFamilies: activeRoutingMap().families,
    routingAliases: activeRoutingMap().aliases,
    aliasPickerShowsModel: cfg().get<boolean>('bridge.aliasPickerShowsModel') ?? true,
    // Claude Code setup snippets (#47) — built from the same address/secret the panel already shows, so
    // they cross the boundary only while running, like bridgeSecret.
    claudeSnippets: bridge.isRunning() ? buildClaudeCodeSnippets(bridgeAddress(), bridgeSecret) : undefined,
  };
};

// ----------------------------- Migration ----------------------------- //

// One-time, silent: the pre-catalog key lived in the bare `wisp.apiKey` slot with the model in
// `wisp.model`. The /zen/go/v1 endpoint was the only Provider that existed then, so that key is provably
// a GO key — migrate it to the go slot (not zen). planLegacyMigration() owns the idempotency +
// correctness logic (no-op once the go slot exists, so it runs at most once and can never lose a key);
// here we read the storage state and apply its plan.
const migrateLegacyKey = async (): Promise<void> => {
  const goSlot = keySlot('opencode-go');
  const plan = planLegacyMigration({
    goKeyPresent: !!(await secrets.get(goSlot)),
    legacyKey: await secrets.get(SECRET_KEY),
    legacyModel: cfg().get<string>('model'),
  });
  if (!plan) return;
  await secrets.store(goSlot, plan.storeGoKey);
  if (plan.setModel) {
    await globalState.update(MODEL_MAP_KEY, { ...(globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {}), 'opencode-go': plan.setModel });
  }
  await secrets.delete(SECRET_KEY);
};

// One-time, silent: the renamed `opencode-go` row used to be the misnamed `opencode-zen` row (it always
// pointed at /zen/go/v1), so any key in the old `opencode-zen` slot is provably a GO key. Move it — key
// and remembered model — to the go slot, then DELETE the zen slot + its stale Go model, else the
// genuinely-new `opencode-zen` row (/zen/v1) would inherit a Go key/model and 401. planZenToGoMigration()
// owns idempotency (no-op once the go slot exists). Runs BEFORE migrateLegacyKey so the rare
// both-slots-present case frees the zen slot rather than orphaning a Go key in it.
const migrateZenToGo = async (): Promise<void> => {
  const goSlot = keySlot('opencode-go');
  const zenSlot = keySlot('opencode-zen');
  const models = globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {};
  const plan = planZenToGoMigration({
    goKeyPresent: !!(await secrets.get(goSlot)),
    zenSlotKey: await secrets.get(zenSlot),
    zenSlotModel: models['opencode-zen'],
  });
  if (!plan) return;
  await secrets.store(goSlot, plan.storeGoKey);
  const nextModels = { ...models };
  delete nextModels['opencode-zen']; // the old zen-slot model was a Go model — don't leak it to new Zen
  if (plan.setModel) nextModels['opencode-go'] = plan.setModel;
  await globalState.update(MODEL_MAP_KEY, nextModels);
  await secrets.delete(zenSlot); // free the slot for the genuinely-new /zen/v1 provider
};

// ----------------------------- Inline diff (B2) ----------------------------- //

// A visible editor showing the given document, if any (Accept/Reject and decorations need the editor,
// not just the document — they may run from a CodeLens click after focus moved).
const editorFor = (uri: vscode.Uri): vscode.TextEditor | undefined =>
  vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());

// Tear down the current preview: drop both decoration sets on its editor and forget it. Idempotent —
// called before rendering a new preview and after Accept/Reject so two previews can never coexist.
const clearPreview = (): void => {
  if (!activePreview) return;
  const editor = editorFor(activePreview.uri);
  editor?.setDecorations(addedDecoration, []);
  editor?.setDecorations(removedDecoration, []);
  activePreview = undefined;
  onDidChangeCodeLenses.fire();
};

// Render the model's rewrite as an in-editor diff: replace the span with the old+new lines interleaved
// (unified-diff order), paint removed lines red / added lines green, and arm the Accept/Reject lenses.
// Each diff op consumes exactly one preview line, so line bookkeeping is exact (kept text stays
// undecorated). Pure line-diff math lives in catalog.diffLines; this is the vscode rendering glue.
const renderInlineDiff = async (
  editor: vscode.TextEditor, span: vscode.Range, originalText: string, replacement: string,
): Promise<void> => {
  clearPreview();
  const ops = diffLines(originalText, replacement);

  // diffLines op text is \r-free; rejoin with the document's own EOL so a CRLF file stays CRLF.
  const eol = editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  // The preview buffer text = every op's line in order; accept keeps only kept+added lines.
  const previewLines = ops.map((o) => o.text);
  const acceptText = ops.filter((o) => o.type !== 'remove').map((o) => o.text).join(eol);

  await editor.edit((b) => b.replace(span, previewLines.join(eol)));

  // The preview occupies ops.length lines from span.start; mark each add/remove line for decoration.
  const added: vscode.Range[] = [];
  const removed: vscode.Range[] = [];
  ops.forEach((op, idx) => {
    const line = span.start.line + idx;
    const lineRange = new vscode.Range(line, 0, line, 0);
    if (op.type === 'add') added.push(lineRange);
    else if (op.type === 'remove') removed.push(lineRange);
  });
  editor.setDecorations(addedDecoration, added);
  editor.setDecorations(removedDecoration, removed);

  // Range covering exactly the rendered preview, so Accept/Reject replace the whole block. End char is
  // span.start.character only on a single-line preview (the first line keeps any pre-span prefix).
  const endLine = span.start.line + previewLines.length - 1;
  const endChar = previewLines.length === 1
    ? span.start.character + previewLines[0].length
    : previewLines[previewLines.length - 1].length;
  // Anchor the Accept/Reject lenses at the first changed line, not the span top — for a whole-file
  // edit span.start is line 0, which would strand the lenses off-screen above the actual diff.
  const firstChange = ops.findIndex((o) => o.type !== 'keep');
  activePreview = {
    uri: editor.document.uri,
    range: new vscode.Range(span.start, new vscode.Position(endLine, endChar)),
    lensLine: span.start.line + (firstChange < 0 ? 0 : firstChange),
    acceptText,
    originalText,
  };
  onDidChangeCodeLenses.fire();
};

// Resolve the preview: Accept swaps the old+new block for the accepted text, Reject restores the
// original span. Both then tear the preview down.
const resolvePreview = async (accept: boolean): Promise<void> => {
  if (!activePreview) return;
  const { uri, range, acceptText, originalText } = activePreview;
  const editor = editorFor(uri);
  if (editor) await editor.edit((b) => b.replace(range, accept ? acceptText : originalText));
  clearPreview();
};

// CodeLens provider for the Accept/Reject pair. Two lenses on the preview's first line, shown only
// while a preview is live for this document — nothing to contribute otherwise.
const editCodeLensProvider: vscode.CodeLensProvider = {
  onDidChangeCodeLenses: onDidChangeCodeLenses.event,
  provideCodeLenses: (document) => {
    if (!activePreview || activePreview.uri.toString() !== document.uri.toString()) return [];
    const at = new vscode.Range(activePreview.lensLine, 0, activePreview.lensLine, 0);
    return [
      new vscode.CodeLens(at, { title: '$(check) Accept', command: 'wisp.acceptEdit' }),
      new vscode.CodeLens(at, { title: '$(x) Reject', command: 'wisp.rejectEdit' }),
    ];
  },
};

// ----------------------------- Commands ----------------------------- //

// Prompt for the API key and store it in the OS keychain.
const setApiKey = async (): Promise<void> => {
  const value = await vscode.window.showInputBox({
    prompt: 'API key (from https://opencode.ai/auth)',
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) return; // user cancelled
  if (!value.trim()) {
    // Storing '' would silently un-set the key while the toast claims it was saved.
    vscode.window.showWarningMessage('Empty input — API key unchanged.');
    return;
  }
  await storeApiKey(value);
  vscode.window.showInformationMessage('Wisp: API key saved.');
};

// Codex sign-in: run the browser OAuth flow, store the tokens, refresh the panel. Failure (cancelled /
// port busy / network) is surfaced; a successful sign-in flips the Codex row to "usable".
const codexSignIn = async (): Promise<void> => {
  try {
    await codexAuth.signIn();
    vscode.window.showInformationMessage('Wisp: signed in to Codex.');
    void panel?.postState();
  } catch (err) {
    output.appendLine(`[error] codex sign-in ${String(err)}`);
    vscode.window.showErrorMessage(`Wisp: Codex sign-in failed — ${String(err)}`);
  }
};

// Codex sign-out: clear the stored token bundle and refresh the panel.
const codexSignOut = async (): Promise<void> => {
  await codexAuth.signOut();
  vscode.window.showInformationMessage('Wisp: signed out of Codex.');
  void panel?.postState();
};

// Anthropic sign-in: run the Claude.ai OAuth flow, store the tokens, refresh the panel.
const anthropicSignIn = async (): Promise<void> => {
  try {
    await anthropicAuth.signIn();
    vscode.window.showInformationMessage('Wisp: signed in to Claude.');
    void panel?.postState();
  } catch (err) {
    output.appendLine(`[error] anthropic sign-in ${String(err)}`);
    vscode.window.showErrorMessage(`Wisp: Claude sign-in failed — ${String(err)}`);
  }
};

// Anthropic sign-out: clear the stored token bundle and refresh the panel.
const anthropicSignOut = async (): Promise<void> => {
  await anthropicAuth.signOut();
  vscode.window.showInformationMessage('Wisp: signed out of Claude.');
  void panel?.postState();
};

// The Bridge's localhost address (no path) — shown in the panel and the base for the injected BASE_URL.
const bridgeAddress = (): string => `http://127.0.0.1:${bridgePort()}`;

// The access secret, from SecretStorage — generated once on first use (high-entropy random, base64url so
// it's copy-paste safe) then reused so a configured CLI keeps working across restarts.
const ensureBridgeSecret = async (): Promise<string> => {
  const existing = (await secrets.get(BRIDGE_SECRET_SLOT))?.trim();
  if (existing) return existing;
  const generated = randomBytes(32).toString('base64url');
  await secrets.store(BRIDGE_SECRET_SLOT, generated);
  return generated;
};

// Point every future integrated terminal at the live Bridge (#35): the five Copilot CLI BYOK vars, read from
// the process env at terminal creation. COPILOT_MODEL = the Active Provider's RESOLVED model (not its id), so
// Copilot CLI's own UI shows the real model name; the Bridge routes that model name back to the active
// Provider (#b). It is a launch-time snapshot (env is fixed at terminal creation) — existing terminals need a
// relaunch to pick it up (the panel hint); the model actually used stays live (the Bridge re-resolves per request).
const injectCopilotEnv = (): void => {
  envCollection.replace('COPILOT_PROVIDER_BASE_URL', `${bridgeAddress()}/v1`);
  envCollection.replace('COPILOT_MODEL', activeModel());
  envCollection.replace('COPILOT_PROVIDER_API_KEY', bridgeSecret);
  envCollection.replace('COPILOT_PROVIDER_TYPE', 'openai');
  envCollection.replace('COPILOT_OFFLINE', 'true');
  envCollection.description = 'Wisp Bridge — Copilot CLI BYOK vars (open a new terminal to pick them up).';
};

// Start the Bridge: materialize the secret (so the listener can require it), bind the port, point new
// terminals at it. Shared by the command and the panel switch — one lifecycle, never forked.
const startBridge = async (): Promise<void> => {
  bridgeSecret = await ensureBridgeSecret();
  await bridge.start();
  injectCopilotEnv();
};

// Stop the Bridge: close the port, forget the in-memory secret, stop pointing terminals at a dead port.
// ponytail: bridge.stop()'s server.close() is async, so a fast stop→start (panel double-click) can hit
// EADDRINUSE before the OS frees the port; it self-heals (error toast + retry once freed). Gate the toggle
// button on a transition flag if that race ever bites in practice.
const stopBridge = (): void => {
  bridge.stop();
  bridgeSecret = '';
  envCollection.clear();
};

// Toggle command (palette) — drives the SAME start/stop the panel switch uses, then pushes panel state so
// the indicator + address/secret reflect the change on either trigger.
const bridgeToggle = async (): Promise<void> => {
  try {
    if (bridge.isRunning()) {
      stopBridge();
      vscode.window.showInformationMessage('Wisp: Bridge stopped.');
    } else {
      await startBridge();
      vscode.window.showInformationMessage(`Wisp: Bridge on ${bridgeAddress()} — address + secret are in the Wisp panel.`);
    }
  } catch (err) {
    output.appendLine(`[error] bridge toggle ${String(err)}`);
    vscode.window.showErrorMessage(`Wisp: Bridge failed to start — ${String(err)}`);
  }
  void panel?.postState();
};

// Panel copy buttons → the system clipboard via VS Code (webview clipboard access is restricted, so the copy
// is done host-side on values the host already owns). No-op for the secret when the Bridge is stopped.
const copyBridgeSecret = async (): Promise<void> => {
  if (!bridgeSecret) return;
  await vscode.env.clipboard.writeText(bridgeSecret);
  vscode.window.showInformationMessage('Wisp: Bridge access secret copied.');
};
const copyBridgeAddress = async (): Promise<void> => {
  await vscode.env.clipboard.writeText(bridgeAddress());
  vscode.window.showInformationMessage('Wisp: Bridge address copied.');
};

// Copy one Claude Code setup snippet (#47). Rebuilt host-side from the values the host owns — the webview
// only names the variant, it never sends snippet text back. No-op while stopped (no secret to embed).
const copyClaudeSnippet = async (variant: keyof ClaudeCodeSnippets): Promise<void> => {
  if (!bridge.isRunning() || !bridgeSecret) return;
  await vscode.env.clipboard.writeText(buildClaudeCodeSnippets(bridgeAddress(), bridgeSecret)[variant]);
  vscode.window.showInformationMessage('Wisp: Claude Code snippet copied — open a new terminal (or restart claude) to pick it up.');
};

// List served models in a quick-pick and write the choice into the setting.
const listModels = async (): Promise<void> => {
  if (!(await resolveApiKey())) {
    vscode.window.showWarningMessage("Set your API key first (command: 'Wisp: Set API Key').");
    return;
  }
  try {
    const ids = await fetchModelIds();
    output.appendLine(`Models: ${ids.join(', ')}`);
    const pick = await vscode.window.showQuickPick(ids, { placeHolder: 'Select a model (updates the setting)' });
    if (pick) {
      await setModel(pick);
      vscode.window.showInformationMessage(`Wisp: model set to ${pick}.`);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to list models: ${String(err)}`);
  }
};

// Inquire: type an instruction → the model returns SEARCH/REPLACE edit blocks over the whole-file
// context; Wisp locates each block and applies it to produce the edited file, then renders the
// before/after as an in-editor diff (red removed / green added) with Accept/Reject CodeLenses.
// Editing via blocks — not a span or whole-file re-emit — keeps untouched code byte-for-byte intact,
// so the diff shows only the real changes. No longer routes through the inline-completion provider.
const inquire = async (): Promise<void> => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;

  const instruction = await vscode.window.showInputBox({
    prompt: 'Wisp: describe the edit',
    placeHolder: 'e.g. make findBy reject a null predicate',
    ignoreFocusOut: true,
  });
  if (instruction === undefined) return; // user cancelled the input box
  if (!instruction.trim()) {
    vscode.window.showWarningMessage('Wisp: no instruction given.');
    return;
  }

  // Two usability rules: the OAuth Providers (Codex, Anthropic) are usable when SIGNED IN (no API key);
  // every other Provider when keyed.
  const provider = activeProvider();
  const codex = isCodexProvider(provider);
  const anthropic = isAnthropicProvider(provider);
  let creds: CodexCreds | undefined;
  let anthropicCreds: AnthropicCreds | undefined;
  if (codex) {
    creds = await codexAuth.current();
    if (!isCodexSignedIn(creds)) {
      vscode.window.showWarningMessage("Sign in to Codex first (command: 'Wisp: Sign in to Codex').");
      return;
    }
  } else if (anthropic) {
    anthropicCreds = await anthropicAuth.current();
    if (!isAnthropicSignedIn(anthropicCreds)) {
      vscode.window.showWarningMessage("Sign in to Claude first (command: 'Wisp: Sign in to Claude').");
      return;
    }
  } else if (!(await resolveApiKey())) {
    vscode.window.showWarningMessage("Set your API key first (command: 'Wisp: Set API Key').");
    return;
  }
  const client = codex || anthropic ? undefined : await getClient();
  if (!codex && !anthropic && !client) return;

  const model = activeModel();
  const original = document.getText();
  const messages = buildEditPrompt({ instruction, languageId: document.languageId, context: original });

  // Bridge the progress notification's Cancel to an AbortController so it also kills the HTTP call.
  const controller = new AbortController();
  enterInFlight();
  const started = Date.now();
  let reply = '';
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Wisp: editing…', cancellable: true },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        // Codex speaks the Responses API and Anthropic the Messages API (each its own client); every
        // other Provider uses the OpenAI SDK.
        if (codex) {
          reply = await codexInquire({ creds: creds!, baseUrl: activeBaseUrl(), model, messages, effort: standardEffortToCodex(activeEffort()), signal: controller.signal });
        } else if (anthropic) {
          reply = await anthropicInquire({ creds: anthropicCreds!, baseUrl: activeBaseUrl(), model, messages, effort: activeEffort(), signal: controller.signal });
        } else {
          const maxTokens = cfg().get<number>('maxTokens') ?? 0;
          const res = await client!.chat.completions.create(
            {
              model,
              messages,
              ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
              temperature: cfg().get<number>('temperature') ?? 0.1,
            },
            { signal: controller.signal },
          );
          reply = res.choices[0]?.message?.content ?? '';
        }
      },
    );
    lastError = false;
    output.appendLine(`inquire ${model} ${Date.now() - started}ms ${reply.length}c`);
  } catch (err) {
    // Cancelling via the notification is normal (aborts); only surface real failures.
    if (!controller.signal.aborted) {
      lastError = true;
      output.appendLine(`[error] inquire ${String(err)}`);
      // OpenAI's APIConnectionError says only "Connection error." — the real transport failure
      // (ENOTFOUND / ECONNRESET / ETIMEDOUT / cert) is on err.cause. Log it so failures are diagnosable.
      const cause = (err as { cause?: { message?: string; code?: string } })?.cause;
      if (cause) output.appendLine(`[error] inquire cause: ${cause.code ?? ''} ${cause.message ?? String(cause)}`);
      output.appendLine(`[error] inquire ctx: base=${activeBaseUrl()} provider=${activeProvider().id} model=${activeModel()} chars=${original.length}`);
      vscode.window.showErrorMessage(`Wisp: inquire failed — ${String(err)}`);
    }
    return;
  } finally {
    exitInFlight();
  }

  // Parse the reply into edit blocks and apply them to the whole document.
  const blocks = parseEditBlocks(reply);
  if (blocks.length === 0) {
    vscode.window.showInformationMessage('Wisp: nothing to change.');
    return;
  }
  const plan = applyEditBlocks(original, blocks);
  // Every block's SEARCH text was missing → the model quoted code that isn't in the file; nothing safe
  // to apply. Surface it rather than render an empty diff.
  if (plan.notFound.length === blocks.length) {
    vscode.window.showWarningMessage('Wisp: could not locate the text to edit — no changes applied.');
    return;
  }
  // applyEditBlocks output is LF; compare against the LF-normalized original so a no-op edit is caught.
  if (plan.text === original.replace(/\r\n/g, '\n')) {
    vscode.window.showInformationMessage('Wisp: no change suggested.');
    return;
  }
  // Some blocks applied, some didn't — let the user review what landed, but warn about the misses.
  if (plan.notFound.length > 0) {
    vscode.window.showWarningMessage(
      `Wisp: ${plan.notFound.length} of ${blocks.length} edits could not be located and were skipped.`,
    );
  }

  // Whole-document span: blocks edit targeted regions, so diff the whole file before/after. Safe — the
  // untouched code is copied verbatim by applyEditBlocks, so diffLines emits a minimal diff (this is the
  // applied result, NOT the whole-file model re-emit that mangles code).
  const span = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
  await renderInlineDiff(editor, span, original, plan.text);
};

// ----------------------------- Activation ----------------------------- //

export const activate = (context: vscode.ExtensionContext): void => {
  output = vscode.window.createOutputChannel('Wisp');
  secrets = context.secrets;
  globalState = context.globalState;
  // The Bridge injects the COPILOT_* BYOK vars into this collection while running (#35); cleared on stop.
  // The collection is .persistent by default, so VS Code re-applies the last session's vars on reload —
  // but the Bridge always starts OFF, so clear them on activate or new terminals would inherit a dead-port
  // BASE_URL + stale secret while nothing is listening.
  envCollection = context.environmentVariableCollection;
  envCollection.clear();
  // Codex token lifecycle — browser open goes through vscode.env.openExternal; logs to the Wisp channel.
  codexAuth = new CodexAuth(context.secrets, (url) => vscode.env.openExternal(vscode.Uri.parse(url)), (m) => output.appendLine(m));
  // Anthropic (Claude.ai) token lifecycle — same injection as Codex.
  anthropicAuth = new AnthropicAuth(context.secrets, (url) => vscode.env.openExternal(vscode.Uri.parse(url)), (m) => output.appendLine(m));
  // Silent one-time migrations, ordered: Zen→Go slot move (frees the zen slot for the new /zen/v1
  // provider) BEFORE the pre-catalog wisp.apiKey→go shim, so the rare both-present case can't orphan a
  // Go key in the zen slot. Both are idempotent on the go slot, so the pair is a no-op after the first.
  void (async () => { await migrateZenToGo(); await migrateLegacyKey(); })();

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.show();
  renderStatus();

  // Whole-line diff backgrounds reusing the theme's diff colors so the preview reads like a real diff.
  addedDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
  });
  removedDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
    textDecoration: 'line-through',
  });

  panel = new WispPanelProvider(context.extensionUri, {
    getState,
    getActivity: () => inFlight > 0, // current Activity for the panel's initial sync on 'ready'
    storeApiKey,
    clearApiKey,
    fetchModelIds,
    setModel,
    setProvider,
    setBaseUrl,
    codexSignIn,
    codexSignOut,
    anthropicSignIn,
    anthropicSignOut,
    setEffort,
    setFamilyRoute, // Routing map Family rows (#51) — set/clear one row
    setAlias, // Routing map Alias rows (#52) — add/retarget one
    removeAlias, // Routing map Alias rows (#52) — remove one by name
    setAliasPickerShowsModel, // alias picker rows: pinned-model suffix on/off (#52)
    toggleBridge: bridgeToggle, // the panel switch drives the SAME start/stop as the command
    copyBridgeSecret,
    copyBridgeAddress,
    copyClaudeSnippet,
  });

  // The Bridge listener — the outward mirror of the LM Chat Provider. Reuses the same key/client resolvers
  // and model memory; keyed Providers only this slice (Codex #39 / Anthropic #40 later). OFF until toggled.
  bridge = createBridgeServer({
    providers: PROVIDERS,
    modelMap: () => globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {},
    customBaseUrl: () => cfg().get<string>('baseUrl') ?? '',
    keyFor: keyForProvider,
    clientFor: clientForProvider,
    // Codex over the Bridge (#39): no API key — the signed-in flag gates its /v1/models row, current()
    // returns the refreshed OAuth bundle, and the shared Effort knob drives its Responses reasoning.
    codexSignedIn: () => codexAuth.isSignedIn(),
    codexCreds: () => codexAuth.current(),
    // Anthropic over the Bridge (#40): same shape — signed-in flag gates its row, current() returns the
    // refreshed OAuth bundle for the Messages stream.
    anthropicSignedIn: () => anthropicAuth.isSignedIn(),
    anthropicCreds: () => anthropicAuth.current(),
    effort: () => activeEffort(),
    activeProviderId: () => activeProvider().id,
    routingMap: () => activeRoutingMap(), // the Routing map (#51), read live so panel edits apply next call
    aliasPickerShowsModel: () => cfg().get<boolean>('bridge.aliasPickerShowsModel') ?? true,
    port: bridgePort,
    accessSecret: () => bridgeSecret,
    log: (m) => output.appendLine(m),
  });

  context.subscriptions.push(
    output,
    statusBar,
    bridge, // closes the listener on deactivate
    vscode.window.registerWebviewViewProvider(WispPanelProvider.viewId, panel),
    vscode.commands.registerCommand('wisp.setApiKey', setApiKey),
    vscode.commands.registerCommand('wisp.listModels', listModels),
    vscode.commands.registerCommand('wisp.inquire', inquire),
    vscode.commands.registerCommand('wisp.bridgeToggle', bridgeToggle),
    vscode.commands.registerCommand('wisp.codexSignIn', codexSignIn),
    vscode.commands.registerCommand('wisp.codexSignOut', codexSignOut),
    vscode.commands.registerCommand('wisp.anthropicSignIn', anthropicSignIn),
    vscode.commands.registerCommand('wisp.anthropicSignOut', anthropicSignOut),
    // Internal — invoked by the inline-diff CodeLenses, not contributed to the palette.
    vscode.commands.registerCommand('wisp.acceptEdit', () => resolvePreview(true)),
    vscode.commands.registerCommand('wisp.rejectEdit', () => resolvePreview(false)),
    addedDecoration,
    removedDecoration,
    onDidChangeCodeLenses,
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, editCodeLensProvider),
    // Additional surface: expose the catalog's keyed Providers as models in VS Code's native chat /
    // Ctrl+I picker. extension.ts owns key resolution; the provider module is pure vscode/openai glue.
    registerWispChatProvider({
      providers: PROVIDERS,
      modelMap: () => globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {},
      customBaseUrl: () => cfg().get<string>('baseUrl') ?? '',
      keyFor: keyForProvider,
      clientFor: clientForProvider,
      // Codex usability + creds for the chat surface: signed-in flag gates the row, current() returns the
      // refreshed OAuth bundle for the streaming Responses call.
      codexSignedIn: () => codexAuth.isSignedIn(),
      codexCreds: () => codexAuth.current(),
      // The reasoning Effort governs the chat path too — one source of truth with Inquire, shared by
      // Codex and Anthropic (#31).
      effort: () => activeEffort(),
      // Anthropic chat surface: same shape as Codex — signed-in flag gates the row, current() returns the
      // refreshed OAuth bundle for the streaming Messages call.
      anthropicSignedIn: () => anthropicAuth.isSignedIn(),
      anthropicCreds: () => anthropicAuth.current(),
      log: (m) => output.appendLine(m),
    }),
    // Keep derived state in sync when settings change out from under us.
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Active Provider, its (Custom) base URL, or its mirrored model changed → rebuild the client.
      if (e.affectsConfiguration('wisp.provider') || e.affectsConfiguration('wisp.baseUrl') || e.affectsConfiguration('wisp.model')) cachedClient = undefined;
      // A raw wisp.provider edit (no panel in Issue 4) must re-mirror wisp.model to the new Provider.
      if (e.affectsConfiguration('wisp.provider')) void mirrorActiveModel();
      // COPILOT_MODEL = the Active Provider's resolved model (#b); keep it true if the Provider OR its model
      // switches mid-run so new terminals get the current choice. Only the model var — BASE_URL stays bound to the port.
      if ((e.affectsConfiguration('wisp.provider') || e.affectsConfiguration('wisp.model')) && bridge.isRunning()) envCollection.replace('COPILOT_MODEL', activeModel());
      // Any of our settings may be on screen in the panel — mirror every change there.
      if (e.affectsConfiguration(CONFIG_NS)) void panel?.postState();
    }),
    // Single sync point for key changes: fires for this window's store/delete and for changes made
    // in other windows sharing SecretStorage. Any wisp.apiKey* slot (legacy or namespaced) → drop
    // the cached client and re-sync the panel.
    context.secrets.onDidChange((e) => {
      if (e.key === SECRET_KEY || e.key.startsWith(`${SECRET_KEY}.`)) {
        cachedClient = undefined;
        void panel?.postState();
      }
    }),
  );
};

export const deactivate = (): void => {};
