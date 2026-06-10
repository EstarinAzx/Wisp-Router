// ----------------- app.tsx — side-panel UI: key, model picker, on/off toggle ----------------- //

/*
 * Depends on:
 *   - preact/hooks: useState/useEffect for local UI state.
 *   - acquireVsCodeApi (webview/vscode.d.ts): postMessage channel to the extension.
 *
 * Data shapes:
 *   - State: { keyIsSet, model, enabled, baseUrl } — pushed by the extension; the key value
 *     itself never arrives here, only the keyIsSet boolean.
 *   - InMsg: state{state} | models{ids} | modelsError{message} | activity{thinking} — everything
 *     the extension sends. activity carries the live Thinking/Idle state, separate from state.
 *   - Outbound: ready | setApiKey{value} | clearApiKey | selectModel{value} | setEnabled{value}
 *     | refreshModels.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

// ----------------------------- Types & channel ----------------------------- //

type State = {
  keyIsSet: boolean;
  keySource: 'stored' | 'env' | 'none';
  model: string;
  enabled: boolean;
  baseUrl: string;
};

type InMsg =
  | { type: 'state'; state: State }
  | { type: 'models'; ids: string[] }
  | { type: 'modelsError'; message: string }
  | { type: 'activity'; thinking: boolean };

const vscode = acquireVsCodeApi();

// ----------------------------- App ----------------------------- //

export const App = () => {
  const [state, setState] = useState<State | undefined>(undefined);
  // Activity arrives on its own lightweight 'activity' message, kept apart from `state`.
  const [thinking, setThinking] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  // Where the current models list came from — used to drop it when endpoint/credentials change.
  const modelsOrigin = useRef<{ baseUrl: string; keyIsSet: boolean } | undefined>(undefined);

  useEffect(() => {
    const onMessage = (e: MessageEvent<InMsg>) => {
      const msg = e.data;
      if (msg.type === 'state') {
        // The fetched list belonged to the previous endpoint/credentials — don't keep
        // offering ids the new endpoint may not serve.
        const prev = modelsOrigin.current;
        if (prev && (prev.baseUrl !== msg.state.baseUrl || (prev.keyIsSet && !msg.state.keyIsSet))) {
          setModels([]);
        }
        // First state, a newly-set key, or a changed endpoint → pull the live list once so the
        // dropdown fills on its own. Without this the user only ever sees the configured model
        // until they discover the manual ↻. Gated on origin change so it can't loop on an
        // empty result or re-fire on unrelated config pushes (model/enabled changes).
        const newOrigin = !prev || prev.baseUrl !== msg.state.baseUrl || prev.keyIsSet !== msg.state.keyIsSet;
        modelsOrigin.current = { baseUrl: msg.state.baseUrl, keyIsSet: msg.state.keyIsSet };
        setState(msg.state);
        if (newOrigin && msg.state.keyIsSet) {
          setModelsError('');
          vscode.postMessage({ type: 'refreshModels' });
        }
      }
      if (msg.type === 'models') { setModels(msg.ids); setModelsError(''); }
      if (msg.type === 'modelsError') setModelsError(msg.message);
      if (msg.type === 'activity') setThinking(msg.thinking);
    };
    window.addEventListener('message', onMessage);
    // 'ready' makes the extension push the first state — the webview restarts from scratch
    // every time the panel is reopened, so it must always ask rather than assume.
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!state) return <p class="p-3 text-[var(--vscode-descriptionForeground)]">Loading…</p>;

  const saveKey = () => {
    const value = keyDraft.trim();
    if (!value) return;
    vscode.postMessage({ type: 'setApiKey', value });
    setKeyDraft(''); // never keep the typed key around longer than needed
  };

  // Optimistic local echo: the extension's state push confirms (or reverts) the choice,
  // but without this an unrelated re-render mid-round-trip snaps the controls back.
  const chooseModel = (value: string) => {
    setState({ ...state, model: value });
    vscode.postMessage({ type: 'selectModel', value });
  };

  const applyModelDraft = () => {
    const value = modelDraft.trim();
    if (!value) return;
    chooseModel(value);
    setModelDraft('');
  };

  // Keep the select truthful even before the live list is fetched (or when the configured
  // model isn't served): show the current model as an extra option.
  const options = models.includes(state.model) ? models : [state.model, ...models];

  return (
    <main class="flex flex-col gap-4 p-3">

      {/* ------------------------------ Activity ------------------------------ */}
      {/* Muted (not hidden) when disabled — Idle dressed for "off", not a third state. */}
      <section class={`flex items-center gap-2 ${state.enabled ? '' : 'opacity-50'}`}>
        <span
          class={`inline-block h-2 w-2 rounded-full ${
            thinking
              ? 'animate-pulse bg-[var(--vscode-progressBar-background)]'
              : 'bg-[var(--vscode-charts-green,var(--vscode-descriptionForeground))]'
          }`}
        />
        <span class="text-[var(--vscode-descriptionForeground)]">{thinking ? 'Thinking…' : 'Idle'}</span>
      </section>

      {/* ------------------------------ API key ------------------------------ */}
      <section class="flex flex-col gap-1.5">
        <h2 class="section-title">API Key</h2>
        <p class="text-[var(--vscode-descriptionForeground)]">
          {state.keySource === 'stored' ? '● Key set'
            : state.keySource === 'env' ? '● Using OPENCODE_API_KEY from environment'
            : '○ No key set'}
        </p>
        <input
          class="input"
          type="password"
          placeholder="Paste OpenCode API key"
          value={keyDraft}
          onInput={(e) => setKeyDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }}
        />
        <div class="flex gap-1.5">
          <button class="btn" disabled={!keyDraft.trim()} onClick={saveKey}>
            {state.keyIsSet ? 'Update' : 'Save'}
          </button>
          <button
            class="btn btn-secondary"
            disabled={state.keySource !== 'stored'} // Clear can't remove an env-provided key
            onClick={() => vscode.postMessage({ type: 'clearApiKey' })}
          >
            Clear
          </button>
        </div>
      </section>

      {/* ------------------------------ Model ------------------------------ */}
      <section class="flex flex-col gap-1.5">
        <h2 class="section-title">Model</h2>
        <div class="flex gap-1.5">
          <select
            class="input min-w-0 flex-1"
            value={state.model}
            onChange={(e) => chooseModel(e.currentTarget.value)}
          >
            {options.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <button
            class="btn btn-secondary shrink-0"
            title="Refresh model list from the endpoint"
            onClick={() => { setModelsError(''); vscode.postMessage({ type: 'refreshModels' }); }}
          >
            ↻
          </button>
        </div>
        <input
          class="input"
          type="text"
          placeholder="Or type a model id and press Enter"
          value={modelDraft}
          onInput={(e) => setModelDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyModelDraft(); }}
        />
        {modelsError && <p class="text-[var(--vscode-errorForeground)]">{modelsError}</p>}
      </section>

      {/* ------------------------------ Toggle ------------------------------ */}
      <section class="flex items-center gap-2">
        <input
          id="enabled"
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => {
            const value = e.currentTarget.checked;
            setState({ ...state, enabled: value }); // optimistic — state push confirms
            vscode.postMessage({ type: 'setEnabled', value });
          }}
        />
        <label for="enabled">Autocomplete enabled</label>
      </section>

      <footer class="text-xs text-[var(--vscode-descriptionForeground)] break-all">
        {state.baseUrl}
      </footer>
    </main>
  );
};
