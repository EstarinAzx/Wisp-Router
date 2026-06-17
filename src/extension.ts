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
  buildEditPrompt, parseEditBlocks, applyEditBlocks, diffLines,
} from './catalog';
import { registerWispChatProvider } from './chatProvider';

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
// The context/output caps track each row's DEFAULT model and are advisory (VS Code prompt budgeting);
// rows without them fall back to the conservative catalog defaults. Vision is detected from the active
// model id (catalog.modelSupportsVision), so it follows model switches and isn't a per-row flag.
const PROVIDERS: Provider[] = [
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/go/v1', defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', apiKeyEnv: 'OPENAI_API_KEY', maxInputTokens: 128_000, maxOutputTokens: 16_384 },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY', maxInputTokens: 128_000, maxOutputTokens: 32_768 },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'codestral-latest', apiKeyEnv: 'MISTRAL_API_KEY', maxInputTokens: 256_000 },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', apiKeyEnv: 'OPENROUTER_API_KEY', maxInputTokens: 128_000, maxOutputTokens: 16_384 },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen2.5-coder' /* ⚠ best-effort: user must have pulled it */, apiKeyEnv: '' },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', defaultModel: 'gpt-oss:120b' /* verified working 2026-06-16 */, apiKeyEnv: 'OLLAMA_API_KEY' },
  { id: 'kilocode', label: 'KiloCode', baseUrl: 'https://api.kilo.ai/api/gateway', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify namespace via /models */, apiKeyEnv: 'KILOCODE_API_KEY', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
  { id: 'cline', label: 'Cline', baseUrl: 'https://api.cline.bot/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify via /models */, apiKeyEnv: 'CLINE_API_KEY', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
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

// Active model: the Provider's remembered model (globalState) else its native default. Each Provider
// keeps its own model — one global id is wrong across Providers (Zen minimax-m3 vs Groq llama-…).
const activeModel = (): string =>
  resolveModel(globalState.get<Record<string, string>>(MODEL_MAP_KEY) ?? {}, activeProvider());

// Base URL for the Active Provider. Built-ins use their hardcoded catalog URL; only Custom reads the
// user-supplied, machine-scoped wisp.baseUrl (every built-in ignores that setting entirely).
const activeBaseUrl = (): string => resolveBaseUrl(activeProvider(), cfg().get<string>('baseUrl') ?? '');

// Key resolution for a given Provider: its namespaced SecretStorage slot first, then the row's own env
// var (OPENCODE_API_KEY for Zen, GROQ_API_KEY for Groq, …). Never read from plaintext settings. Takes
// the Provider explicitly so the chat surface can resolve any catalog row, not only the Active one.
const keyForProvider = async (p: Provider): Promise<string> => {
  const stored = await secrets.get(keySlot(p.id));
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

  if (!(await resolveApiKey())) {
    vscode.window.showWarningMessage("Set your API key first (command: 'Wisp: Set API Key').");
    return;
  }
  const client = await getClient();
  if (!client) return;

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
        reply = res.choices[0]?.message?.content ?? '';
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
  void migrateLegacyKey(); // silent one-time wisp.apiKey → wisp.apiKey.opencode-zen

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
  });

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerWebviewViewProvider(WispPanelProvider.viewId, panel),
    vscode.commands.registerCommand('wisp.setApiKey', setApiKey),
    vscode.commands.registerCommand('wisp.listModels', listModels),
    vscode.commands.registerCommand('wisp.inquire', inquire),
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
      log: (m) => output.appendLine(m),
    }),
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
