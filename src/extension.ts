// ------------- extension.ts — OpenCode Zen inline autocomplete for VS Code ------------- //

/*
 * Depends on:
 *   - vscode: editor host API — registers the inline provider, reads settings, stores the key
 *     in the OS keychain (SecretStorage), drives the status-bar indicator and the cancellation token.
 *   - openai: OpenAI-compatible client, pointed at the OpenCode Zen base URL — the exact pattern
 *     used by the reference llm-provider (`new OpenAI({ apiKey, baseURL })` → chat.completions.create).
 *   - ./sidePanelProvider: the side-panel webview. It receives the shared action helpers below
 *     (storeApiKey/clearApiKey/fetchModelIds/setModel/setEnabled/getState) so panel and commands
 *     drive the exact same logic.
 *
 * Data shapes:
 *   - CursorContext: { prefix, suffix } — document text sliced on each side of the caret, joined
 *     with a <CURSOR> marker. Zen has no fill-in-middle route, so a chat model is prompted to act
 *     as a completer over this context.
 *   - InlineCompletionItem: a VS Code ghost-text suggestion ({ insertText, range }).
 *
 * Design decisions (settled in design review): chat-as-completer (no FIM), non-streaming,
 * debounce via the cancellation token, key in SecretStorage (env-var fallback), adaptive short
 * completions (max_tokens 64), gating + single-entry cache to cut cost, prefix-overlap trim to
 * kill the doubled-line glitch, and a status-bar heartbeat because latency is user-visible.
 */

import * as vscode from 'vscode';
import OpenAI from 'openai';
import { NO_KEY_MESSAGE, OpenCodePanelProvider, PanelState } from './sidePanelProvider';

// ----------------------------- Constants ----------------------------- //

const CONFIG_NS = 'opencodeAutocomplete';
const SECRET_KEY = 'opencodeAutocomplete.apiKey'; // keychain entry name, not a literal key
const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1';
// Bare id, not "opencode/minimax-m3": the /go chat endpoint rejects the provider-prefixed
// form ("401 Model … is not supported") and wants the id exactly as /models serves it.
const DEFAULT_MODEL = 'minimax-m3';

// Zen/go has no fill-in-middle route, so we hand a chat model the code on both sides of the caret
// and ask for only the insertion — this instruction is what makes a chat model behave like a completer.
const SYSTEM_PROMPT =
  'You are an autocomplete engine inside a code editor. ' +
  'Continue the code at the <CURSOR> marker. ' +
  'Return ONLY the raw text to insert at the cursor — no explanation, no markdown fences, ' +
  'and do not repeat the surrounding code. Return an empty string if nothing should be inserted.';

// ----------------------------- Module state ----------------------------- //

let output: vscode.OutputChannel;
let secrets: vscode.SecretStorage;
let statusBar: vscode.StatusBarItem;

// Reuse one client; rebuild only when key/baseURL change (construction is local, no network).
let cachedClient: { key: string; baseURL: string; client: OpenAI } | undefined;

// Single-entry result cache: identical context re-fires (VS Code re-queries on cursor moves /
// re-renders, not just keystrokes) return instantly with zero network cost.
let lastResult: { key: string; items: vscode.InlineCompletionItem[] } | undefined;

// Status-bar heartbeat state: number of requests on the wire, and whether the last one failed.
let inFlight = 0;
let lastError = false;

// Side panel handle so key/config changes can push fresh state into the webview.
let panel: OpenCodePanelProvider | undefined;

// ----------------------------- Configuration ----------------------------- //

const cfg = () => vscode.workspace.getConfiguration(CONFIG_NS);

// Key resolution: SecretStorage (OS keychain) first, then the OPENCODE_API_KEY env var the
// reference provider uses. The key is never read from plaintext settings.json.
const resolveApiKey = async (): Promise<string> => {
  const stored = await secrets.get(SECRET_KEY);
  return stored?.trim() || process.env.OPENCODE_API_KEY || '';
};

const getClient = async (): Promise<OpenAI | undefined> => {
  const key = await resolveApiKey();
  if (!key) return undefined;
  const baseURL = cfg().get<string>('baseUrl') || DEFAULT_BASE_URL;
  if (!cachedClient || cachedClient.key !== key || cachedClient.baseURL !== baseURL) {
    cachedClient = { key, baseURL, client: new OpenAI({ apiKey: key, baseURL }) };
  }
  return cachedClient.client;
};

// ----------------------------- Text utilities ----------------------------- //

// Slice the document into the {prefix, suffix} window sent as context (one read, both slices).
const buildContext = (doc: vscode.TextDocument, pos: vscode.Position): { prefix: string; suffix: string } => {
  const maxPrefix = cfg().get<number>('maxPrefixChars') ?? 2000;
  const maxSuffix = cfg().get<number>('maxSuffixChars') ?? 1000;
  const full = doc.getText();
  const offset = doc.offsetAt(pos);
  return {
    prefix: full.slice(Math.max(0, offset - maxPrefix), offset),
    suffix: full.slice(offset, offset + maxSuffix),
  };
};

const buildUserPrompt = (languageId: string, prefix: string, suffix: string): string =>
  `Language: ${languageId}\n\n${prefix}<CURSOR>${suffix}`;

// Reasoning models (e.g. minimax-m3) emit their chain-of-thought inline as a <think>…</think>
// block before the real completion — strip it so the ghost text is the answer, not the thinking.
// An unterminated <think> means the token budget ran out mid-thought (no answer yet) → insert nothing.
const stripThink = (text: string): string => {
  if (/<think>/i.test(text) && !/<\/think>/i.test(text)) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
};

// Strip a wrapping ``` fence if the model added one despite instructions.
const stripFences = (text: string): string => {
  const m = text.match(/^```[\w-]*\r?\n([\s\S]*?)\r?\n?```$/);
  return m ? m[1] : text;
};

// Trim the longest suffix of `prefix` that the suggestion repeats at its head. Chat models often
// echo the current line ("const x = " → "const x = 42"); without this the ghost text doubles it.
const stripPrefixOverlap = (prefix: string, suggestion: string): string => {
  const max = Math.min(prefix.length, suggestion.length);
  for (let n = max; n > 0; n--) {
    if (prefix.endsWith(suggestion.slice(0, n))) return suggestion.slice(n);
  }
  return suggestion;
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ----------------------------- Status bar ----------------------------- //

// Reflect current state in the status bar: disabled / thinking / error / ready. Latency is
// user-visible in this provider, so a heartbeat is the difference between "working" and "frozen".
const renderStatus = (): void => {
  if (!statusBar) return;
  if (!cfg().get<boolean>('enabled', true)) {
    statusBar.text = '$(circle-slash) OpenCode';
    statusBar.tooltip = 'OpenCode autocomplete: disabled (click to enable)';
  } else if (inFlight > 0) {
    statusBar.text = '$(sync~spin) OpenCode';
    statusBar.tooltip = 'OpenCode autocomplete: thinking…';
  } else if (lastError) {
    statusBar.text = '$(error) OpenCode';
    statusBar.tooltip = 'OpenCode autocomplete: last request failed — see the OpenCode Autocomplete output channel';
  } else {
    statusBar.text = '$(sparkle) OpenCode';
    statusBar.tooltip = 'OpenCode autocomplete: ready (click to toggle)';
  }
};

const enterInFlight = () => { inFlight++; renderStatus(); };
const exitInFlight = () => { inFlight = Math.max(0, inFlight - 1); renderStatus(); };

// ----------------------------- Provider ----------------------------- //

const provider: vscode.InlineCompletionItemProvider = {
  async provideInlineCompletionItems(document, position, context, token) {
    if (!cfg().get<boolean>('enabled', true)) return;

    // Gating: drop obviously-wasted fires before spending anything.
    // - native IntelliSense widget already open → don't double-suggest
    // - user has a selection → they're selecting, not typing
    if (context.selectedCompletionInfo) return;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document && !editor.selection.isEmpty) return;

    const model = cfg().get<string>('model') || DEFAULT_MODEL;
    const { prefix, suffix } = buildContext(document, position);
    if (!prefix.trim()) return; // nothing to go on

    // Cache hit: same model + same surrounding text → reuse the last items, no network/cost.
    const cacheKey = `${model}\0${prefix}\0${suffix}`;
    if (lastResult && lastResult.key === cacheKey) return lastResult.items;

    // Debounce: wait out the quiet window. VS Code cancels this token on the next keystroke, so an
    // abandoned request bails here before it ever reaches the network.
    await delay(cfg().get<number>('debounceMs') ?? 300);
    if (token.isCancellationRequested) return;

    const client = await getClient();
    if (!client) return; // no key configured — stay silent rather than nag every keystroke

    // Bridge VS Code cancellation to an AbortController so a stale request also kills the HTTP call.
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    enterInFlight();
    const started = Date.now();
    try {
      // 0 = uncapped. A hard token cap is the main source of unreliable output: it truncates
      // multi-line completions mid-line and starves reasoning models, which spend the whole
      // budget inside <think> and never reach the answer. Send max_tokens only when set >0.
      const maxTokens = cfg().get<number>('maxTokens') ?? 0;
      const res = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(document.languageId, prefix, suffix) },
          ],
          ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
          temperature: cfg().get<number>('temperature') ?? 0.1,
        },
        { signal: controller.signal },
      );

      const text = stripPrefixOverlap(prefix, stripFences(stripThink(res.choices[0]?.message?.content ?? '')));
      lastError = false;
      output.appendLine(`${model} ${Date.now() - started}ms ${text.length}c`); // latency log for model tuning

      // Cache even an empty result so identical re-fires don't re-hit the API.
      const items = text.trim()
        ? [new vscode.InlineCompletionItem(text, new vscode.Range(position, position))]
        : [];
      lastResult = { key: cacheKey, items };
      return items;
    } catch (err) {
      // Aborted requests are normal (user kept typing); only surface real failures.
      if (!controller.signal.aborted) {
        lastError = true;
        output.appendLine(`[error] ${String(err)}`);
      }
      return;
    } finally {
      exitInFlight();
    }
  },
};

// ----------------------------- Shared actions ----------------------------- //

// Single source of truth for key/model/enabled mutations — the Command Palette commands and the
// side panel both call these, so the two surfaces can never drift apart.

// Panel sync after key changes happens via the secrets.onDidChange listener in activate() —
// it fires for our own store/delete too, and for changes made from other VS Code windows.
const storeApiKey = async (value: string): Promise<void> => {
  await secrets.store(SECRET_KEY, value.trim());
  cachedClient = undefined;
};

const clearApiKey = async (): Promise<void> => {
  await secrets.delete(SECRET_KEY);
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

const setModel = async (id: string): Promise<void> => {
  await cfg().update('model', id, targetFor('model'));
};

const setEnabled = async (value: boolean): Promise<void> => {
  await cfg().update('enabled', value, targetFor('enabled'));
  renderStatus();
};

// Everything the panel is allowed to know — key presence and source only, never the key itself.
// keySource keeps the UI honest when the key comes from the env var (Clear can't remove that).
const getState = async (): Promise<PanelState> => {
  const stored = (await secrets.get(SECRET_KEY))?.trim();
  const keySource = stored ? 'stored' : process.env.OPENCODE_API_KEY ? 'env' : 'none';
  return {
    keyIsSet: keySource !== 'none',
    keySource,
    model: cfg().get<string>('model') || DEFAULT_MODEL,
    enabled: cfg().get<boolean>('enabled', true),
    baseUrl: cfg().get<string>('baseUrl') || DEFAULT_BASE_URL,
  };
};

// ----------------------------- Commands ----------------------------- //

// Prompt for the API key and store it in the OS keychain.
const setApiKey = async (): Promise<void> => {
  const value = await vscode.window.showInputBox({
    prompt: 'OpenCode API key (from https://opencode.ai/auth)',
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
  vscode.window.showInformationMessage('OpenCode API key saved.');
};

// List served models in a quick-pick and write the choice into the setting.
const listModels = async (): Promise<void> => {
  if (!(await resolveApiKey())) {
    vscode.window.showWarningMessage("Set your OpenCode API key first (command: 'OpenCode: Set API Key').");
    return;
  }
  try {
    const ids = await fetchModelIds();
    output.appendLine(`Models: ${ids.join(', ')}`);
    const pick = await vscode.window.showQuickPick(ids, { placeHolder: 'Select a model (updates the setting)' });
    if (pick) {
      await setModel(pick);
      vscode.window.showInformationMessage(`OpenCode model set to ${pick}.`);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to list models: ${String(err)}`);
  }
};

// Flip the enabled flag (also bound to the status-bar click).
const toggle = (): Promise<void> => setEnabled(!cfg().get<boolean>('enabled', true));

// ----------------------------- Activation ----------------------------- //

export const activate = (context: vscode.ExtensionContext): void => {
  output = vscode.window.createOutputChannel('OpenCode Autocomplete');
  secrets = context.secrets;

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'opencodeAutocomplete.toggle';
  statusBar.show();
  renderStatus();

  panel = new OpenCodePanelProvider(context.extensionUri, {
    getState,
    storeApiKey,
    clearApiKey,
    fetchModelIds,
    setModel,
    setEnabled,
  });

  context.subscriptions.push(
    output,
    statusBar,
    // Match every file; narrow with a language selector if you want per-language control.
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider),
    vscode.window.registerWebviewViewProvider(OpenCodePanelProvider.viewId, panel),
    vscode.commands.registerCommand('opencodeAutocomplete.setApiKey', setApiKey),
    vscode.commands.registerCommand('opencodeAutocomplete.listModels', listModels),
    vscode.commands.registerCommand('opencodeAutocomplete.toggle', toggle),
    // Keep derived state in sync when settings change out from under us.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('opencodeAutocomplete.baseUrl')) cachedClient = undefined;
      if (e.affectsConfiguration('opencodeAutocomplete.enabled')) renderStatus();
      // Any of our settings may be on screen in the panel — mirror every change there.
      if (e.affectsConfiguration(CONFIG_NS)) void panel?.postState();
    }),
    // Single sync point for key changes: fires for this window's store/delete and for
    // changes made in other VS Code windows sharing the same SecretStorage.
    context.secrets.onDidChange((e) => {
      if (e.key === SECRET_KEY) void panel?.postState();
    }),
  );
};

export const deactivate = (): void => {};
