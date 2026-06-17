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
 *     | selectProvider{value} | setBaseUrl{value} | refreshModels.
 *   - Ext → webview messages: state{state} | models{ids} | modelsError{message} | activity{thinking}.
 */

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

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
