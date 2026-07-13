// ---------- sidePanelProvider.ts — side-panel webview: HTML shell + message routing ---------- //

/*
 * Depends on:
 *   - vscode: WebviewViewProvider registration surface, asWebviewUri/cspSource for safe asset
 *     loading, postMessage for the UI ↔ extension channel.
 *   - crypto (node): nonce generation for the CSP script-src.
 *
 * Data shapes:
 *   - PanelState: { keyIsSet, keySource, keyEnv, model, baseUrl, providerId, providers,
 *     isCustom } — everything the panel may know. The API key value itself never crosses the
 *     webview boundary, only the keyIsSet boolean.
 *   - PanelHost: the shared action helpers injected from extension.ts (store/clear key, fetch
 *     model ids, set model/provider/baseUrl, read state + Activity) — avoids a circular import.
 *   - Webview → ext messages: ready | setApiKey{value} | clearApiKey | selectModel{value}
 *     | selectProvider{value} | setBaseUrl{value} | refreshModels | codexSignIn | codexSignOut
 *     | selectEffort{value} | bridgeToggle | copyBridgeSecret | copyBridgeAddress | copyClaudeSnippet{value}
 *     | setFamilyRoute{value:{family,providerId,model}} | setAlias{value:{name,providerId,model}}
 *     | removeAlias{value:{name}}.
 *   - Ext → webview messages: state{state} | models{ids} | modelsError{message} | activity{thinking}.
 */

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { FamilyKey, Target } from './routing';

// ----------------------------- Types ----------------------------- //

export type PanelState = {
  keyIsSet: boolean;
  keySource: 'stored' | 'env' | 'none';
  keyEnv: string; // active Provider's env-var name, so the env hint names the right var ('' = none)
  model: string;
  baseUrl: string;
  providerId?: string; // Active Provider id (drives the dropdown's selected value)
  providers: { id: string; label: string }[]; // the catalog, for the dropdown
  isCustom: boolean; // active Provider is Custom → the panel reveals the editable base-URL field (Issue 7)
  kind?: 'openai-chat' | 'codex' | 'anthropic-oauth'; // the OAuth kinds swap the API-key field for sign-in/out
  signedIn?: boolean; // OAuth kinds only: whether a token bundle is present
  modelOptions?: string[]; // OAuth kinds only: models.dev-sourced ids for the dropdown (curated fallback; no live /models route)
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; // Codex + Anthropic: the reasoning-effort knob (governs every call)
  effortOptions?: ('low' | 'medium' | 'high' | 'xhigh' | 'max')[]; // per-model option list — host-computed so 'max' only shows for max-capable Claude (#32)
  bridgeRunning: boolean; // Bridge listener state → the panel's running/stopped indicator + Start/Stop label
  bridgeAddress: string; // http://127.0.0.1:<port> — shown so the user knows what to point the CLI at
  bridgeSecret?: string; // the access secret, sent only while running (meant to be copied into the CLI)
  claudeSnippets?: { powershell: string; bash: string; settingsJson: string }; // Claude Code setup snippets (#47), sent only while running
  routingFamilies?: { [K in FamilyKey]?: Target }; // the Routing map's four Family rows (#51)
  routingAliases?: { name: string; target: Target }[]; // the Routing map's Alias rows (#52)
};

// Shared with extension.ts so the no-key failure is recognizable as webview-safe text.
export const NO_KEY_MESSAGE = 'No API key set.';

export type PanelHost = {
  getState: () => Promise<PanelState>;
  getActivity: () => boolean; // true = a completion request is in flight (Thinking)
  storeApiKey: (value: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  fetchModelIds: () => Promise<string[]>;
  setModel: (id: string) => Promise<void>;
  setProvider: (id: string) => Promise<void>;
  setBaseUrl: (url: string) => Promise<void>;
  codexSignIn: () => Promise<void>;
  codexSignOut: () => Promise<void>;
  anthropicSignIn: () => Promise<void>;
  anthropicSignOut: () => Promise<void>;
  setEffort: (effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max') => Promise<void>;
  setFamilyRoute: (family: FamilyKey, target: Target | undefined) => Promise<void>; // set/clear one Routing map Family row (#51)
  setAlias: (name: string, target: Target) => Promise<void>; // add/retarget one Routing map Alias row (#52)
  removeAlias: (name: string) => Promise<void>; // remove one Routing map Alias row by name (#52)
  toggleBridge: () => Promise<void>; // start/stop the Bridge — the same lifecycle the command drives
  copyBridgeSecret: () => Promise<void>; // copy the access secret to the clipboard (host-side, webview can't)
  copyBridgeAddress: () => Promise<void>;
  copyClaudeSnippet: (variant: 'powershell' | 'bash' | 'settingsJson') => Promise<void>; // copy one Claude Code setup snippet (#47)
};

// ----------------------------- Error sanitizing ----------------------------- //

// Server error bodies can echo credential material (e.g. "Incorrect API key provided: sk-…"),
// so raw error text never crosses the webview boundary — only our own constant or a status code.
const sanitizeError = (err: unknown): string => {
  if (err instanceof Error && err.message === NO_KEY_MESSAGE) return NO_KEY_MESSAGE;
  const status = (err as { status?: unknown } | undefined)?.status;
  return typeof status === 'number'
    ? `Failed to fetch models (HTTP ${status}).`
    : 'Failed to fetch models.';
};

// ----------------------------- Provider ----------------------------- //

// Serves the Preact UI bundle and routes its messages onto the injected host helpers.
export class WispPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'wisp.panel';

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: PanelHost,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };
    view.webview.html = this.renderHtml(view.webview);
    view.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
    // The view is torn down whenever the panel is hidden; drop the stale handle so
    // postState() becomes a no-op instead of posting into a disposed webview.
    view.onDidDispose(() => { this.view = undefined; });
  }

  // Push fresh state to the UI. Called on 'ready' and by extension.ts whenever
  // config or the stored key changes outside the panel.
  postState = async (): Promise<void> => {
    if (!this.view) return;
    void this.view.webview.postMessage({ type: 'state', state: await this.host.getState() });
  };

  // Push the live Thinking/Idle Activity to the UI. Kept separate from postState so this
  // high-frequency per-request ping never triggers the async getState / model-refetch path.
  postActivity = (thinking: boolean): void => {
    void this.view?.webview.postMessage({ type: 'activity', thinking });
  };

  // ----------------------------- Message routing ----------------------------- //

  private onMessage = async (msg: { type?: string; value?: unknown }): Promise<void> => {
    try {
      switch (msg?.type) {
        case 'ready':
          // Sync both surfaces on (re)open: the webview restarts from scratch each time.
          await this.postState();
          this.postActivity(this.host.getActivity());
          return;
        case 'setApiKey':
          if (typeof msg.value === 'string' && msg.value.trim()) await this.host.storeApiKey(msg.value);
          return;
        case 'clearApiKey':
          await this.host.clearApiKey();
          return;
        case 'selectModel':
          if (typeof msg.value === 'string' && msg.value.trim()) await this.host.setModel(msg.value.trim());
          return;
        case 'selectProvider':
          if (typeof msg.value === 'string' && msg.value.trim()) await this.host.setProvider(msg.value.trim());
          return;
        case 'setBaseUrl':
          if (typeof msg.value === 'string' && msg.value.trim()) await this.host.setBaseUrl(msg.value.trim());
          return;
        case 'refreshModels': {
          const ids = await this.host.fetchModelIds();
          void this.view?.webview.postMessage({ type: 'models', ids });
          return;
        }
        case 'codexSignIn':
          // The OAuth flow + its own postState live in the host; the panel just triggers it.
          await this.host.codexSignIn();
          return;
        case 'codexSignOut':
          await this.host.codexSignOut();
          return;
        case 'anthropicSignIn':
          await this.host.anthropicSignIn();
          return;
        case 'anthropicSignOut':
          await this.host.anthropicSignOut();
          return;
        case 'selectEffort':
          // Constrain to the valid depths so a malformed message can't write a junk value ('max' added #32).
          if (msg.value === 'low' || msg.value === 'medium' || msg.value === 'high' || msg.value === 'xhigh' || msg.value === 'max') await this.host.setEffort(msg.value);
          return;
        case 'bridgeToggle':
          // Start/stop the Bridge; the host pushes fresh state so the indicator + secret update.
          await this.host.toggleBridge();
          return;
        case 'copyBridgeSecret':
          await this.host.copyBridgeSecret();
          return;
        case 'copyBridgeAddress':
          await this.host.copyBridgeAddress();
          return;
        case 'copyClaudeSnippet':
          // The webview only names the variant; the host rebuilds and copies its own values.
          if (msg.value === 'powershell' || msg.value === 'bash' || msg.value === 'settingsJson') await this.host.copyClaudeSnippet(msg.value);
          return;
        case 'setFamilyRoute': {
          // A Family row commit (#51): both halves present → the row's Target; an empty Provider or
          // model → explicit unmapped. Family is constrained to the four fixed keys — junk is dropped.
          const v = msg.value as { family?: unknown; providerId?: unknown; model?: unknown } | undefined;
          if (v?.family !== 'opus' && v?.family !== 'sonnet' && v?.family !== 'haiku' && v?.family !== 'fable') return;
          const providerId = typeof v.providerId === 'string' ? v.providerId.trim() : '';
          const model = typeof v.model === 'string' ? v.model.trim() : '';
          await this.host.setFamilyRoute(v.family, providerId && model ? { providerId, model } : undefined);
          return;
        }
        case 'setAlias': {
          // An Alias add/retarget (#52): all three halves must be present; the host re-checks the
          // Provider-id collision + Target validity (this switch only shapes the untrusted message).
          const v = msg.value as { name?: unknown; providerId?: unknown; model?: unknown } | undefined;
          const name = typeof v?.name === 'string' ? v.name.trim() : '';
          const providerId = typeof v?.providerId === 'string' ? v.providerId.trim() : '';
          const model = typeof v?.model === 'string' ? v.model.trim() : '';
          if (name && providerId && model) await this.host.setAlias(name, { providerId, model });
          return;
        }
        case 'removeAlias': {
          const v = msg.value as { name?: unknown } | undefined;
          if (typeof v?.name === 'string' && v.name) await this.host.removeAlias(v.name);
          return;
        }
      }
    } catch (err) {
      if (msg?.type === 'refreshModels') {
        void this.view?.webview.postMessage({ type: 'modelsError', message: sanitizeError(err) });
        return;
      }
      // A failed mutation fires no config event, so nothing would re-sync the controlled
      // inputs — push the real state so the UI snaps back to truth.
      void this.postState();
    }
  };

  // ----------------------------- HTML shell ----------------------------- //

  private renderHtml(webview: vscode.Webview): string {
    const assetRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, 'main.css'));
    const nonce = randomBytes(16).toString('base64');

    // Strict CSP: only the nonce'd module script and extension-served styles may load.
    // Vite production builds link a static stylesheet, so no 'unsafe-inline' is needed.
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Wisp</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
