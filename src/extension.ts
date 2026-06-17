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
import OpenAI from 'openai';
import { NO_KEY_MESSAGE, WispPanelProvider, PanelState } from './sidePanelProvider';
import {
  Provider, CUSTOM_ID, resolveModel, resolveBaseUrl, planLegacyMigration,
  buildEditPrompt, extractEditText,
} from './catalog';

// ----------------------------- Constants ----------------------------- //

const CONFIG_NS = 'wisp';
// Legacy (pre-catalog) keychain slot. Per-Provider keys now live in `${SECRET_KEY}.<id>` slots;
// this bare name is read once by migrateLegacyKey() then deleted. Not a literal key.
const SECRET_KEY = 'wisp.apiKey';

// ----------------------------- Provider catalog ----------------------------- //

// A Provider is one OpenAI-chat-compatible backend, reached by swapping {baseUrl, key, model} on the
// same `openai` SDK. Base URLs are HARDCODED here, never read from settings: choosing a Provider
// chooses where the bearer key is sent, so a workspace-overridable URL would be a key-redirect vector.
// The catalog is the nine built-ins below (OpenCode Zen default) plus a user-defined Custom row whose
// base URL alone comes from settings (machine-scoped wisp.baseUrl). No model-id transform — each
// defaultModel is in the Provider's native form (re-adding Zen's `opencode/` prefix 401s the /go
// endpoint, which wants the bare id /models serves). GitHub Copilot and Cursor are deliberately
// absent (ban risk / shape-incompatible — see the 2026-06-15 multi-provider ADR + gotchas).
// defaultModel for the first five is doc-verified and ollama-cloud is user-verified (2026-06-16); the
// three still marked ⚠ are BEST-EFFORT presets — no key was available to verify them against each GET
// /models, so the panel's model picker / type-field is the correction path. ⚠ Ollama Cloud is `/v1`,
// NOT `/api/v1` (the `/api` prefix is Ollama's native protocol and breaks the OpenAI SDK — see gotchas.md).
const PROVIDERS: Provider[] = [
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/go/v1', defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', apiKeyEnv: 'OPENAI_API_KEY' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'codestral-latest', apiKeyEnv: 'MISTRAL_API_KEY' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', apiKeyEnv: 'OPENROUTER_API_KEY' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen2.5-coder' /* ⚠ best-effort: user must have pulled it */, apiKeyEnv: '' },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', defaultModel: 'gpt-oss:120b' /* verified working 2026-06-16 */, apiKeyEnv: 'OLLAMA_API_KEY' },
  { id: 'kilocode', label: 'KiloCode', baseUrl: 'https://api.kilo.ai/api/gateway', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify namespace via /models */, apiKeyEnv: 'KILOCODE_API_KEY' },
  { id: 'cline', label: 'Cline', baseUrl: 'https://api.cline.bot/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify via /models */, apiKeyEnv: 'CLINE_API_KEY' },
  // Custom: the always-works escape hatch and the only Provider whose base URL + model are
  // user-supplied (machine-scoped wisp.baseUrl + a typed model, resolved at runtime by
  // activeBaseUrl()). No env fallback — its key lives only in the wisp.apiKey.custom slot.
  { id: 'custom', label: 'Custom', baseUrl: '', defaultModel: '', apiKeyEnv: '' },
];

// globalState key for the per-Provider model memory: { providerId: model }.
const MODEL_MAP_KEY = 'wisp.models';

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

// ----------------------------- Configuration ----------------------------- //

const cfg = () => vscode.workspace.getConfiguration(CONFIG_NS);

// The Active Provider is the source of truth. Read wisp.provider; an unknown id falls back to the
// default row (PROVIDERS[0]) so a stale/typo'd setting can never leave us provider-less.
const activeProvider = (): Provider =>
  PROVIDERS.find((p) => p.id === cfg().get<string>('provider')) ?? PROVIDERS[0];

// SecretStorage slot for a Provider's key: `wisp.apiKey.<id>` (the bare SECRET_KEY is the
// pre-catalog legacy slot, migrated once on activate).
const keySlot = (id: string): string => `${SECRET_KEY}.${id}`;

// Active model: the Provider's remembered model (globalState) else its native default. Each Provider
// keeps its own model — one global id is wrong across Providers (Zen minimax-m3 vs Groq llama-…).
const activeModel = (): string =>
  resolveModel(globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {}, activeProvider());

// Base URL for the Active Provider. Built-ins use their hardcoded catalog URL; only Custom reads the
// user-supplied, machine-scoped wisp.baseUrl (every built-in ignores that setting entirely).
const activeBaseUrl = (): string => resolveBaseUrl(activeProvider(), cfg().get<string>('baseUrl') ?? '');

// Key resolution for the Active Provider: its namespaced SecretStorage slot first, then the row's own
// env var (OPENCODE_API_KEY for Zen, GROQ_API_KEY for Groq, …). Never read from plaintext settings.
const resolveApiKey = async (): Promise<string> => {
  const p = activeProvider();
  const stored = await secrets.get(keySlot(p.id));
  return stored?.trim() || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : '') || '';
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
  await secrets.store(keySlot(activeProvider().id), value.trim());
  cachedClient = undefined;
};

const clearApiKey = async (): Promise<void> => {
  await secrets.delete(keySlot(activeProvider().id));
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
  const stored = (await secrets.get(keySlot(p.id)))?.trim();
  const keySource = stored ? 'stored' : p.apiKeyEnv && process.env[p.apiKeyEnv] ? 'env' : 'none';
  return {
    keyIsSet: keySource !== 'none',
    keySource,
    keyEnv: p.apiKeyEnv, // shown in the env-key hint so it names the active Provider's var, not Zen's
    model: activeModel(),
    baseUrl: activeBaseUrl(),
    providerId: p.id,
    providers: PROVIDERS.map((r) => ({ id: r.id, label: r.label })), // drives the panel dropdown
    isCustom: p.id === CUSTOM_ID,
  };
};

// ----------------------------- Migration ----------------------------- //

// One-time, silent: the pre-catalog key lived in the bare `wisp.apiKey` slot with the model in
// `wisp.model`. Zen was the only Provider that existed then, so that key is provably the Zen key.
// planLegacyMigration() owns the idempotency + correctness logic (no-op once the Zen slot exists, so
// it runs at most once and can never lose a key); here we read the storage state and apply its plan.
const migrateLegacyKey = async (): Promise<void> => {
  const zenSlot = keySlot('opencode-zen');
  const plan = planLegacyMigration({
    zenKeyPresent: !!(await secrets.get(zenSlot)),
    legacyKey: await secrets.get(SECRET_KEY),
    legacyModel: cfg().get<string>('model'),
  });
  if (!plan) return;
  await secrets.store(zenSlot, plan.storeZenKey);
  if (plan.setModel) {
    await globalState.update(MODEL_MAP_KEY, { ...(globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {}), 'opencode-zen': plan.setModel });
  }
  await secrets.delete(SECRET_KEY);
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

// Inquire: type an instruction → the AI rewrites the target span (the selection, or the current line
// when nothing is selected) over the whole-file context. Applied as a confirmable WorkspaceEdit, so
// VS Code's native refactor-preview shows the diff and the user accepts/rejects. One replace covers
// both add and delete. No longer routes through the inline-completion provider (no pendingInquiry).
const inquire = async (): Promise<void> => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  // Target span = the selection, or the whole current line when there is no selection.
  const span = editor.selection.isEmpty
    ? document.lineAt(editor.selection.active.line).range
    : new vscode.Range(editor.selection.start, editor.selection.end);
  const selectionText = document.getText(span);

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

  if (!(await resolveApiKey())) {
    vscode.window.showWarningMessage("Set your API key first (command: 'Wisp: Set API Key').");
    return;
  }
  const client = await getClient();
  if (!client) return;

  const model = activeModel();
  const messages = buildEditPrompt({
    selectionText, instruction, languageId: document.languageId, context: document.getText(),
  });

  // Bridge the progress notification's Cancel to an AbortController so it also kills the HTTP call.
  const controller = new AbortController();
  enterInFlight();
  const started = Date.now();
  let replacement = '';
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Wisp: editing…', cancellable: true },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        const maxTokens = cfg().get<number>('maxTokens') ?? 0;
        const res = await client.chat.completions.create(
          {
            model,
            messages,
            ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
            temperature: cfg().get<number>('temperature') ?? 0.1,
          },
          { signal: controller.signal },
        );
        replacement = extractEditText(res.choices[0]?.message?.content ?? '');
      },
    );
    lastError = false;
    output.appendLine(`inquire ${model} ${Date.now() - started}ms ${replacement.length}c`);
  } catch (err) {
    // Cancelling via the notification is normal (aborts); only surface real failures.
    if (!controller.signal.aborted) {
      lastError = true;
      output.appendLine(`[error] inquire ${String(err)}`);
      vscode.window.showErrorMessage(`Wisp: inquire failed — ${String(err)}`);
    }
    return;
  } finally {
    exitInFlight();
  }

  // Nothing came back, or the model echoed the span verbatim → no edit to offer.
  if (!replacement.trim()) {
    vscode.window.showInformationMessage('Wisp: nothing to change.');
    return;
  }
  if (replacement === selectionText) {
    vscode.window.showInformationMessage('Wisp: no change suggested.');
    return;
  }

  // needsConfirmation routes the replace through VS Code's native refactor-preview → accept/reject.
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, span, replacement, { needsConfirmation: true, label: 'Wisp: apply edit' });
  await vscode.workspace.applyEdit(edit);
};

// ----------------------------- Activation ----------------------------- //

export const activate = (context: vscode.ExtensionContext): void => {
  output = vscode.window.createOutputChannel('Wisp');
  secrets = context.secrets;
  globalState = context.globalState;
  void migrateLegacyKey(); // silent one-time wisp.apiKey → wisp.apiKey.opencode-zen

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.show();
  renderStatus();

  panel = new WispPanelProvider(context.extensionUri, {
    getState,
    getActivity: () => inFlight > 0, // current Activity for the panel's initial sync on 'ready'
    storeApiKey,
    clearApiKey,
    fetchModelIds,
    setModel,
    setProvider,
    setBaseUrl,
  });

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerWebviewViewProvider(WispPanelProvider.viewId, panel),
    vscode.commands.registerCommand('wisp.setApiKey', setApiKey),
    vscode.commands.registerCommand('wisp.listModels', listModels),
    vscode.commands.registerCommand('wisp.inquire', inquire),
    // Keep derived state in sync when settings change out from under us.
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Active Provider, its (Custom) base URL, or its mirrored model changed → rebuild the client.
      if (e.affectsConfiguration('wisp.provider') || e.affectsConfiguration('wisp.baseUrl') || e.affectsConfiguration('wisp.model')) cachedClient = undefined;
      // A raw wisp.provider edit (no panel in Issue 4) must re-mirror wisp.model to the new Provider.
      if (e.affectsConfiguration('wisp.provider')) void mirrorActiveModel();
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
