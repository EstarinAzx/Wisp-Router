// ----------------- extension.ts — Wisp: Inquire inline editor ----------------- //

/*
 * Depends on:
 *   - vscode: editor host API — registers the Inquire command, drives the status-bar indicator and
 *     the cancellation token; SecretStorage/globalState are read ONLY by the one-time migration.
 *   - openai: OpenAI-compatible client, pointed at the Active Provider's base URL — the exact pattern
 *     used by the reference llm-provider (`new OpenAI({ apiKey, baseURL })` → chat.completions.create).
 *   - ./sidePanelProvider: the side-panel webview. It receives the shared action helpers below
 *     (storeApiKey/clearApiKey/fetchModelIds/setModel/setProvider/setBaseUrl/getState) so panel and
 *     commands drive the exact same logic.
 *   - @wisp/core: vscode-free Provider-catalog data + the Inquire edit-prompt/reply helpers + the
 *     Wisp home store (~/.wisp/config.json + auth.json, ADR-0002) — the source of truth for keys,
 *     OAuth bundles, Active Provider, models, Effort, Routing map, and Bridge settings, shared with
 *     the TUI. VS Code keeps only editor-local tuning (wisp.maxTokens, wisp.temperature).
 *
 * Design decisions (settled in design review): chat-as-editor over the whole file (one confirmable
 * WorkspaceEdit replace, add and delete in one shot), non-streaming, key in the owner-only auth.json
 * (env-var fallback), a per-Provider model memory, and a status-bar heartbeat because latency is
 * user-visible.
 */

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import OpenAI from 'openai';
import { NO_KEY_MESSAGE, WispPanelProvider, PanelState } from './sidePanelProvider';
import {
  Provider, PROVIDERS, CUSTOM_ID, resolveModel, resolveBaseUrl, resolveKeyId, planLegacyMigration, planZenToGoMigration,
  buildEditPrompt, parseEditBlocks, applyEditBlocks, diffLines, isCodexProvider, isCodexSignedIn, DEFAULT_EFFORT,
  isAnthropicProvider, isAnthropicSignedIn, standardEffortToCodex, effortOptionsFor, oauthModelOptions,
  type CodexCreds, type EffortLevel, type AnthropicCreds,
} from '@wisp/core';
import { getModelsDevCatalog } from '@wisp/core';
import { EMPTY_ROUTING_MAP, withFamilyRoute, withAlias, withoutAlias, type RoutingMap, type FamilyKey, type Target } from '@wisp/core';
import { registerWispChatProvider } from './chatProvider';
import { createBridgeServer, DEFAULT_BRIDGE_PORT } from '@wisp/core';
import { buildClaudeCodeSnippets, ClaudeCodeSnippets } from '@wisp/core';
import { CodexAuth, AnthropicAuth } from '@wisp/core';
import { codexInquire } from '@wisp/core';
import { anthropicInquire } from '@wisp/core';
import { WispHome, planSecretsMigration, seedConfigFromVsCode } from '@wisp/core';

// ----------------------------- Constants ----------------------------- //

const CONFIG_NS = 'wisp';
// Legacy (pre-catalog) keychain slot. Keys live in ~/.wisp/auth.json since #59; the SecretStorage
// slots below are read once by the migrations then deleted. Not literal keys.
const SECRET_KEY = 'wisp.apiKey';
// Legacy SecretStorage slots for the OAuth bundles + the Bridge access secret — migration-only.
const CODEX_SECRET_SLOT = 'wisp.codexAuth';
const ANTHROPIC_SECRET_SLOT = 'wisp.anthropicAuth';
const BRIDGE_SECRET_SLOT = 'wisp.bridge.secret';
// Default Bridge port moved to @wisp/core with #63 — one constant for every face hosting the engine.

// ----------------------------- Provider catalog ----------------------------- //

// The 12-built-ins + Custom data array moved to @wisp/core with #60 (shared with the TUI face);
// imported below with the other core pieces. Everything here still reads the same PROVIDERS.

// Legacy globalState keys — the older migrations still shuffle them, then the config.json seed
// reads them once (#59); nothing else touches globalState anymore.
const MODEL_MAP_KEY = 'wisp.models';
const EFFORT_KEY = 'wisp.effort';
const ROUTING_MAP_KEY = 'wisp.routingMap';

// ----------------------------- Module state ----------------------------- //

let output: vscode.OutputChannel;
let secrets: vscode.SecretStorage; // migration-only — the store below owns secrets since #59
let globalState: vscode.Memento; // migration-only — old model/effort/routing homes, seeded into config.json
let statusBar: vscode.StatusBarItem;

// The Wisp home store (~/.wisp/) — config.json + auth.json, shared with the TUI (ADR-0002).
let home: WispHome;

// Reuse one client; rebuild only when key/baseURL change (construction is local, no network).
let cachedClient: { key: string; baseURL: string; client: OpenAI } | undefined;

// Status-bar heartbeat state: number of requests on the wire, and whether the last one failed.
let inFlight = 0;
let lastError = false;

// Side panel handle so key/config changes can push fresh state into the webview.
let panel: WispPanelProvider | undefined;

// Codex OAuth/token lifecycle (sign-in, store, import, refresh). Set in activate once the home store
// exists; the Inquire codex branch + the sign-in/out commands + the panel state all go through it.
let codexAuth: CodexAuth;

// Anthropic (Claude.ai) OAuth/token lifecycle — same role as codexAuth for the kind:'anthropic-oauth' row.
let anthropicAuth: AnthropicAuth;

// The Bridge listener handle — created in activate, started/stopped by the command AND the panel switch. OFF
// until toggled on (PRD: no local port open until the user deliberately enables it).
let bridge: ReturnType<typeof createBridgeServer>;
// The Bridge access secret, held in memory only while the Bridge runs (the listener reads it sync per
// request). Loaded/generated from auth.json on start, cleared to '' on stop.
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

// Editor-local tuning only (maxTokens, temperature) — everything else lives in ~/.wisp/config.json.
const cfg = () => vscode.workspace.getConfiguration(CONFIG_NS);

// The Active Provider is the source of truth. Read config.json; an unknown id falls back to the
// default row (PROVIDERS[0]) so a stale/typo'd value can never leave us provider-less.
const activeProvider = (): Provider =>
  PROVIDERS.find((p) => p.id === home.readConfig().provider) ?? PROVIDERS[0];

// Legacy SecretStorage slot for a Provider's key: `wisp.apiKey.<id>` — migration reads only.
const keySlot = (id: string): string => `${SECRET_KEY}.${id}`;

// Active model: the Provider's remembered model (config.json) else its native default. Each Provider
// keeps its own model — one global id is wrong across Providers (Zen minimax-m3 vs Groq llama-…).
const activeModel = (): string =>
  resolveModel(home.readConfig().models ?? {}, activeProvider());

// The reasoning Effort — one global value (config.json), defaulting to medium so existing behavior is
// unchanged. Shared by Codex + Anthropic; ignored by every keyed Provider. Stored as the wider EffortLevel
// (#32 'max'); each send site normalizes (standardEffortToCodex for Codex, the clamp for Anthropic).
const activeEffort = (): EffortLevel => home.readConfig().effort ?? DEFAULT_EFFORT;

// The Bridge Routing map (config.json) — empty (everything → Active Provider) until the panel sets rows.
const activeRoutingMap = (): RoutingMap => home.readConfig().routing ?? EMPTY_ROUTING_MAP;

// Base URL for the Active Provider. Built-ins use their hardcoded catalog URL; only Custom reads the
// user-supplied customBaseUrl (every built-in ignores that field entirely).
const activeBaseUrl = (): string => resolveBaseUrl(activeProvider(), home.readConfig().customBaseUrl ?? '');

// The Bridge listen port — config.json bridge.port, or the fixed default when unset.
const bridgePort = (): number => home.readConfig().bridge?.port ?? DEFAULT_BRIDGE_PORT;

// The alias picker rows' pinned-model suffix toggle (#52) — config.json, on by default.
const aliasPickerShowsModel = (): boolean => home.readConfig().bridge?.aliasPickerShowsModel ?? true;

// Key resolution for a given Provider: its (possibly borrowed, via keyId) auth.json entry first,
// then the row's own env var (OPENCODE_API_KEY for OpenCode, GROQ_API_KEY for Groq, …). Never read from
// plaintext settings. Takes the Provider explicitly so the chat surface can resolve any catalog row, not
// only the Active one. Still async — callers predate the sync store and the seam stays put.
const keyForProvider = async (p: Provider): Promise<string> => {
  const stored = home.readAuth().keys?.[resolveKeyId(p)];
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
  const baseURL = resolveBaseUrl(p, home.readConfig().customBaseUrl ?? '');
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

// Key writes land in auth.json under the Provider's (possibly borrowed) key id. The explicit postState
// keeps the panel instant; the ~/.wisp watcher covers other windows and external (TUI) edits.
const storeApiKey = async (value: string): Promise<void> => {
  home.writeAuth({ keys: { ...home.readAuth().keys, [resolveKeyId(activeProvider())]: value.trim() } });
  cachedClient = undefined;
  void panel?.postState();
};

const clearApiKey = async (): Promise<void> => {
  const { [resolveKeyId(activeProvider())]: _dropped, ...rest } = home.readAuth().keys ?? {};
  home.writeAuth({ keys: rest });
  cachedClient = undefined;
  void panel?.postState();
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

// Model ids for ANY catalog Provider — the Routing-map rows' dropdowns (#53). OAuth kinds read the
// models.dev curated list; keyed kinds probe GET /models with that Provider's own key. Every failure
// (unknown id, no key, Custom without URL, offline) is an empty list, never a throw — the row falls
// back to free text and configuring a route is never blocked.
const providerModelIds = async (id: string): Promise<string[]> => {
  const p = PROVIDERS.find((r) => r.id === id);
  if (!p) return [];
  try {
    if (isCodexProvider(p) || isAnthropicProvider(p)) {
      // Same timeout race as getState so a cold models.dev can't stall the row; undefined → curated list.
      const catalog = await Promise.race([
        getModelsDevCatalog(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
      ]);
      return oauthModelOptions(p, catalog) ?? [];
    }
    const client = await clientForProvider(p);
    if (!client) return [];
    return (await client.models.list()).data.map((m) => m.id).sort();
  } catch {
    return [];
  }
};

// COPILOT_MODEL rides the process env into new terminals (#35) — keep it true when the Provider or its
// model changes mid-run. Only the model var; BASE_URL stays bound to the port.
const refreshCopilotModelEnv = (): void => {
  if (bridge.isRunning()) envCollection.replace('COPILOT_MODEL', activeModel());
};

// Remember the chosen model under the Active Provider (config.json). Store writes fire no VS Code
// event, so re-push the panel state explicitly — the pattern for every mutation below.
const setModel = async (id: string): Promise<void> => {
  const p = activeProvider();
  home.writeConfig({ models: { ...home.readConfig().models, [p.id]: id } });
  cachedClient = undefined;
  refreshCopilotModelEnv();
  void panel?.postState();
};

// Persist the Codex reasoning Effort (one global value in config.json).
const setEffort = async (effort: EffortLevel): Promise<void> => {
  home.writeConfig({ effort });
  void panel?.postState();
};

// Set or clear one Family route (#51). The Bridge reads the map live per request — the next
// call picks the change up with no restart. The edit itself is core's pure withFamilyRoute (#65);
// its refusal (dangling Provider id from a malformed webview message) persists nothing.
const setFamilyRoute = async (family: FamilyKey, target: Target | undefined): Promise<void> => {
  const next = withFamilyRoute(activeRoutingMap(), PROVIDERS, family, target);
  if (!next) return;
  home.writeConfig({ routing: next });
  void panel?.postState();
};

// Add or retarget one Alias row (#52). The webview shows the collision message — core's withAlias
// (#65) is the trust boundary that keeps a bypassed/malformed message from persisting an alias that
// shadows a Provider id (the resolver checks ids first, so a shadowing alias would be silently
// unreachable).
const setAlias = async (name: string, target: Target): Promise<void> => {
  const next = withAlias(activeRoutingMap(), PROVIDERS, name, target);
  if (!next) return;
  home.writeConfig({ routing: next });
  void panel?.postState();
};

// Panel toggle for the alias picker rows' model-id suffix (#52). The Bridge reads it live per list request.
const setAliasPickerShowsModel = async (on: boolean): Promise<void> => {
  home.writeConfig({ bridge: { ...home.readConfig().bridge, aliasPickerShowsModel: on } });
  void panel?.postState();
};

// Remove one Alias row by name (#52). Unknown names are a no-op (core's withoutAlias, #65).
const removeAlias = async (name: string): Promise<void> => {
  home.writeConfig({ routing: withoutAlias(activeRoutingMap(), name) });
  void panel?.postState();
};

// Switch the Active Provider — selecting a Provider selects where the bearer key is sent.
const setProvider = async (id: string): Promise<void> => {
  home.writeConfig({ provider: id });
  cachedClient = undefined;
  refreshCopilotModelEnv();
  void panel?.postState();
};

// Custom's base URL (same key-redirect threat as the Provider selector). Built-ins ignore it; only
// Custom resolves from it (activeBaseUrl).
const setBaseUrl = async (url: string): Promise<void> => {
  home.writeConfig({ customBaseUrl: url });
  cachedClient = undefined;
  void panel?.postState();
};

// Everything the panel is allowed to know — key presence and source only, never the key itself.
// keySource keeps the UI honest when the key comes from the env var (Clear can't remove that).
const getState = async (): Promise<PanelState> => {
  const p = activeProvider();
  const stored = home.readAuth().keys?.[resolveKeyId(p)]?.trim();
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
    modelOptions: oauthModelOptions(p, catalog),
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
    aliasPickerShowsModel: aliasPickerShowsModel(),
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

// One-time, silent (#59, ADR-0002): move everything into ~/.wisp. Two halves, each self-idempotent:
// config.json is seeded from the old homes (settings + globalState) only while the file doesn't exist,
// and secrets are COPIED into auth.json then DELETED from SecretStorage — so a second launch finds
// empty slots and does nothing. Runs AFTER the two legacy migrations above so their results are what
// gets copied. planSecretsMigration (pure, tested) owns the merge rules (never clobber auth.json).
const migrateToWispHome = async (): Promise<void> => {
  if (!home.configExists()) {
    // USER-scope values only (inspect().globalValue, never the merged get()): these keys were
    // machine-scoped precisely so a workspace can't redirect where the bearer key is sent, but scope
    // enforcement died with their package.json registration — a merged read would let a repo's
    // .vscode/settings.json seed provider/baseUrl into config.json permanently.
    const userValue = <T>(key: string): T | undefined => cfg().inspect<T>(key)?.globalValue;
    home.writeConfig(seedConfigFromVsCode({
      provider: userValue<string>('provider'),
      models: globalState.get<Record<string, string>>(MODEL_MAP_KEY),
      effort: globalState.get<EffortLevel>(EFFORT_KEY),
      routing: globalState.get<RoutingMap>(ROUTING_MAP_KEY),
      customBaseUrl: userValue<string>('baseUrl'),
      bridgePort: userValue<number>('bridge.port'),
      aliasPickerShowsModel: userValue<boolean>('bridge.aliasPickerShowsModel'),
    }));
    // Retire the old homes so a later hand-deleted config.json reseeds near-empty instead of
    // resurrecting this pre-#59 snapshot. (The orphaned settings.json entries stay — VS Code flags
    // them "unknown", and updating unregistered keys is not reliably allowed.)
    for (const key of [MODEL_MAP_KEY, EFFORT_KEY, ROUTING_MAP_KEY]) await globalState.update(key, undefined);
  }

  // Keys are read per key id (not per Provider) so a borrowed slot (Zen→Go) is read once.
  const keys: Record<string, string> = {};
  const foundSlots: string[] = [];
  for (const id of new Set(PROVIDERS.map(resolveKeyId))) {
    const value = await secrets.get(keySlot(id));
    if (value === undefined) continue;
    keys[id] = value;
    foundSlots.push(keySlot(id));
  }
  const codexRaw = await secrets.get(CODEX_SECRET_SLOT);
  const anthropicRaw = await secrets.get(ANTHROPIC_SECRET_SLOT);
  const bridgeSecretSlot = await secrets.get(BRIDGE_SECRET_SLOT);
  if (codexRaw !== undefined) foundSlots.push(CODEX_SECRET_SLOT);
  if (anthropicRaw !== undefined) foundSlots.push(ANTHROPIC_SECRET_SLOT);
  if (bridgeSecretSlot !== undefined) foundSlots.push(BRIDGE_SECRET_SLOT);

  const next = planSecretsMigration({ auth: home.readAuth(), slots: { keys, codexRaw, anthropicRaw, bridgeSecret: bridgeSecretSlot } });
  if (next) home.writeAuth(next); // throws → slots stay put, retried next launch
  for (const slot of foundSlots) await secrets.delete(slot);
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

// The access secret, from auth.json — generated once on first use (high-entropy random, base64url so
// it's copy-paste safe) then reused so a configured CLI keeps working across restarts.
const ensureBridgeSecret = (): string => {
  const existing = home.readAuth().bridgeSecret?.trim();
  if (existing) return existing;
  const generated = randomBytes(32).toString('base64url');
  home.writeAuth({ bridgeSecret: generated });
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
  bridgeSecret = ensureBridgeSecret();
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
  // The shared ~/.wisp store — everything below (keys, OAuth bundles, config) reads/writes through it.
  home = new WispHome();
  // Codex token lifecycle — creds live in auth.json; browser open via vscode.env.openExternal.
  codexAuth = new CodexAuth(
    { read: () => home.readAuth().codex, write: (c) => { home.writeAuth({ codex: c }); } },
    (url) => vscode.env.openExternal(vscode.Uri.parse(url)), (m) => output.appendLine(m));
  // Anthropic (Claude.ai) token lifecycle — same injection as Codex.
  anthropicAuth = new AnthropicAuth(
    { read: () => home.readAuth().anthropic, write: (c) => { home.writeAuth({ anthropic: c }); } },
    (url) => vscode.env.openExternal(vscode.Uri.parse(url)), (m) => output.appendLine(m));
  // Silent one-time migrations, ordered: Zen→Go slot move (frees the zen slot for the new /zen/v1
  // provider) BEFORE the pre-catalog wisp.apiKey→go shim, so the rare both-present case can't orphan a
  // Go key in the zen slot — then the whole result moves into ~/.wisp (#59). A migration failure must
  // not kill activation: log it and run on what's already in the store.
  void (async () => {
    try {
      await migrateZenToGo();
      await migrateLegacyKey();
      await migrateToWispHome();
      void panel?.postState(); // the panel may have rendered off pre-migration state
    } catch (err) { output.appendLine(`[error] store migration ${String(err)}`); }
  })();

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
    fetchProviderModelIds: providerModelIds, // Routing-map row dropdowns (#53) — any Provider, silent empty on failure
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
    modelMap: () => home.readConfig().models ?? {},
    customBaseUrl: () => home.readConfig().customBaseUrl ?? '',
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
    aliasPickerShowsModel,
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
      modelMap: () => home.readConfig().models ?? {},
      customBaseUrl: () => home.readConfig().customBaseUrl ?? '',
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
    // Single sync point for store changes made OUTSIDE this window's own helpers — another VS Code
    // window, a hand edit, or (soon) the TUI (#59 criteria: pick up external edits without a reload).
    // Every value is re-read from disk per request anyway; this drops the cached client and re-syncs
    // the surfaces that snapshot state (panel, COPILOT_MODEL env).
    home.watch(() => {
      cachedClient = undefined;
      refreshCopilotModelEnv();
      void panel?.postState();
    }),
  );
};

export const deactivate = (): void => {};
