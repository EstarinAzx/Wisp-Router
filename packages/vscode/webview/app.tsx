// ----------------- app.tsx — side-panel UI: key, model picker, provider ----------------- //

/*
 * Depends on:
 *   - preact/hooks: useState/useEffect for local UI state.
 *   - acquireVsCodeApi (webview/vscode.d.ts): postMessage channel to the extension.
 *
 * Data shapes:
 *   - State: { keyIsSet, keySource, keyEnv, model, baseUrl, providerId, providers, isCustom } —
 *     pushed by the extension; the key value itself never arrives here, only keyIsSet.
 *   - InMsg: state{state} | models{ids} | modelsError{message} | providerModels{providerId, ids}
 *     | activity{thinking} — everything the extension sends. activity carries the live
 *     Thinking/Idle state, separate from state.
 *   - Outbound: ready | setApiKey{value} | clearApiKey | selectModel{value} | selectProvider{value}
 *     | setBaseUrl{value} | refreshModels | fetchProviderModels{value: providerId}
 *     | codexSignIn | codexSignOut | selectEffort{value}
 *     | bridgeToggle | copyBridgeSecret | copyBridgeAddress | copyClaudeSnippet{value}
 *     | setFamilyRoute{value:{family,providerId,model}} | setAlias{value:{name,providerId,model}}
 *     | removeAlias{value:{name}} | setAliasPickerShowsModel{value:boolean}.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

// ----------------------------- Types & channel ----------------------------- //

type State = {
  keyIsSet: boolean;
  keySource: 'stored' | 'env' | 'none';
  keyEnv: string;
  model: string;
  baseUrl: string;
  providerId?: string;
  providers: { id: string; label: string }[];
  isCustom: boolean;
  kind?: 'openai-chat' | 'codex' | 'anthropic-oauth';
  signedIn?: boolean;
  modelOptions?: string[];
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  effortOptions?: ('low' | 'medium' | 'high' | 'xhigh' | 'max')[]; // host-computed; 'max' only for max-capable Claude (#32)
  bridgeRunning: boolean;
  bridgeAddress: string;
  bridgeSecret?: string; // present only while running — the secret to paste into the Copilot CLI
  claudeSnippets?: { powershell: string; bash: string; settingsJson: string }; // Claude Code setup snippets (#47), present only while running
  routingFamilies?: Partial<Record<FamilyKey, { providerId: string; model: string }>>; // the Routing map's four Family rows (#51)
  routingAliases?: { name: string; target: { providerId: string; model: string } }[]; // the Routing map's Alias rows (#52)
  aliasPickerShowsModel?: boolean; // alias picker rows carry the pinned model id (#52)
  aliasOnlyModels?: boolean; // Claude Code's /model list shows only Aliases (#67)
};

// The Routing map's four fixed Family routes (#51) — rendered as always-visible rows, in this order.
type FamilyKey = 'opus' | 'sonnet' | 'haiku' | 'fable';
const FAMILY_KEYS: FamilyKey[] = ['opus', 'sonnet', 'haiku', 'fable'];

type InMsg =
  | { type: 'state'; state: State }
  | { type: 'models'; ids: string[] }
  | { type: 'modelsError'; message: string }
  | { type: 'providerModels'; providerId: string; ids: string[] } // a Routing-map row's list (#53); [] = unavailable
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
  // Routing map row drafts (#51): seeded ONCE from the first state push, then owned locally — a state
  // push after a partial commit (provider picked, model still empty → row stored unmapped) must not
  // wipe what the user is mid-typing.
  const [routeDrafts, setRouteDrafts] = useState<Record<FamilyKey, { providerId: string; model: string }> | undefined>(undefined);
  // The Alias add-row draft (#52) — saved rows live in state.routingAliases (host-pushed), only the
  // in-progress new row is local.
  const [aliasDraft, setAliasDraft] = useState({ name: '', providerId: '', model: '' });
  // Where the current models list came from — used to drop it when Provider/endpoint/credentials
  // change. Keyed on providerId too so a switch refetches even if two rows shared a base URL.
  const modelsOrigin = useRef<{ providerId?: string; baseUrl: string; keyIsSet: boolean } | undefined>(undefined);
  // Per-Provider model lists for the Routing-map rows (#53) — one cache entry serves every row that
  // picked that Provider; [] means "asked, unavailable" → the row falls back to free text.
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const requestedProviders = useRef(new Set<string>());

  // One fetch per Provider per panel session — a re-pick never re-spams the endpoint.
  const ensureProviderModels = (id: string) => {
    if (!id || requestedProviders.current.has(id)) return;
    requestedProviders.current.add(id);
    vscode.postMessage({ type: 'fetchProviderModels', value: id });
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent<InMsg>) => {
      const msg = e.data;
      if (msg.type === 'state') {
        // The fetched list belonged to the previous endpoint/credentials — don't keep
        // offering ids the new endpoint may not serve.
        const prev = modelsOrigin.current;
        if (prev && (prev.providerId !== msg.state.providerId || prev.baseUrl !== msg.state.baseUrl || (prev.keyIsSet && !msg.state.keyIsSet))) {
          setModels([]);
        }
        // Key presence changed → the row caches (including cached empties from a key-less fetch) are
        // stale; drop them so the next row pick refetches with the new credentials (#53).
        if (prev && prev.keyIsSet !== msg.state.keyIsSet) {
          setProviderModels({});
          requestedProviders.current.clear();
        }
        // First state, a newly-set key, a switched Provider, or a changed endpoint → pull the live
        // list once so the dropdown fills on its own. Without this the user only ever sees the
        // configured model until they discover the manual ↻. Gated on origin change so it can't loop
        // on an empty result or re-fire on unrelated config pushes (model changes).
        const newOrigin = !prev || prev.providerId !== msg.state.providerId || prev.baseUrl !== msg.state.baseUrl || prev.keyIsSet !== msg.state.keyIsSet;
        modelsOrigin.current = { providerId: msg.state.providerId, baseUrl: msg.state.baseUrl, keyIsSet: msg.state.keyIsSet };
        setState(msg.state);
        // Seed the Routing map drafts from the FIRST state only (functional update — the [] effect
        // closure never sees fresh routeDrafts); later pushes leave in-progress row edits alone.
        setRouteDrafts((cur) => cur ?? Object.fromEntries(FAMILY_KEYS.map((k) => {
          const t = msg.state.routingFamilies?.[k];
          return [k, { providerId: t?.providerId ?? '', model: t?.model ?? '' }];
        })) as Record<FamilyKey, { providerId: string; model: string }>);
        if (newOrigin && msg.state.keyIsSet) {
          setModelsError('');
          vscode.postMessage({ type: 'refreshModels' });
        }
        // First state: fetch lists for the Providers the saved Family rows already reference, so
        // their dropdowns fill on open without a re-pick (#53).
        if (!prev) {
          FAMILY_KEYS.forEach((k) => ensureProviderModels(msg.state.routingFamilies?.[k]?.providerId ?? ''));
        }
      }
      if (msg.type === 'models') { setModels(msg.ids); setModelsError(''); }
      if (msg.type === 'providerModels') setProviderModels((cur) => ({ ...cur, [msg.providerId]: msg.ids }));
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

  // Custom-only: commit the typed base URL. Skip empties so a stray blur can't wipe a working URL.
  const commitBaseUrl = (raw: string) => {
    const value = raw.trim();
    if (value) vscode.postMessage({ type: 'setBaseUrl', value });
  };

  // Commit one Routing map Family row (#51): sync the local draft, then send the whole row — the host
  // stores a Target when both halves are present, else the row goes explicitly unmapped.
  const commitFamilyRoute = (family: FamilyKey, draft: { providerId: string; model: string }) => {
    setRouteDrafts((cur) => cur && { ...cur, [family]: draft });
    vscode.postMessage({ type: 'setFamilyRoute', value: { family, providerId: draft.providerId, model: draft.model } });
  };

  // Alias add-row (#52). A name shadowing a Provider id would be unreachable (the resolver checks ids
  // first), so it's refused HERE with a visible message — the host guard is only the trust boundary.
  const aliasName = aliasDraft.name.trim();
  const aliasCollides = state.providers.some((p) => p.id === aliasName);
  const aliasReady = !!(aliasName && aliasDraft.providerId && aliasDraft.model.trim()) && !aliasCollides;
  const addAlias = () => {
    if (!aliasReady) return;
    vscode.postMessage({ type: 'setAlias', value: { name: aliasName, providerId: aliasDraft.providerId, model: aliasDraft.model.trim() } });
    setAliasDraft({ name: '', providerId: '', model: '' }); // saved row arrives via the state push
  };

  // A Routing-map row's dropdown options (#53): the row Provider's fetched/curated list, with the row's
  // current value prepended when absent so a stored pick stays visible (same idiom as the main picker).
  // No list (not fetched, or unavailable) → undefined → the row renders the free-text input instead.
  const rowModelOptions = (providerId: string, current: string): string[] | undefined => {
    const ids = providerModels[providerId];
    if (!ids?.length) return undefined;
    const cur = current.trim();
    return cur && !ids.includes(cur) ? [cur, ...ids] : ids;
  };

  // The OAuth Providers (Codex, Anthropic) swap the API-key field for a sign-in/out control and carry no
  // live /models route. oauth gates both behaviours; the per-kind label/messages below distinguish them.
  const oauth = state.kind === 'codex' || state.kind === 'anthropic-oauth';
  const accountLabel = state.kind === 'anthropic-oauth' ? 'Claude Account' : 'Codex Account';
  const signInMsg = state.kind === 'anthropic-oauth' ? 'anthropicSignIn' : 'codexSignIn';
  const signOutMsg = state.kind === 'anthropic-oauth' ? 'anthropicSignOut' : 'codexSignOut';
  const accountHint = state.kind === 'anthropic-oauth'
    ? 'Subscription-backed Claude — sign in with your Claude.ai account; no API key.'
    : 'Subscription-backed ChatGPT Codex — sign in with your ChatGPT account; no API key.';

  // OAuth kinds have no live /models list — use the curated modelOptions; every other Provider uses the
  // fetched list. Either way, prepend the current model if it isn't already present so the select stays
  // truthful (e.g. a stale pick still shows alongside the curated ids).
  const baseOptions = oauth ? (state.modelOptions ?? []) : models;
  const options = baseOptions.includes(state.model) ? baseOptions : [state.model, ...baseOptions];

  return (
    <main class="flex flex-col gap-4 p-3">

      {/* ------------------------------ Activity ------------------------------ */}
      {/* The live Thinking/Idle signal — pulse while a request is on the wire, steady dot otherwise. */}
      <section class="flex items-center gap-2">
        <span
          class={`inline-block h-2 w-2 rounded-full ${
            thinking
              ? 'animate-pulse bg-[var(--vscode-progressBar-background)]'
              : 'bg-[var(--vscode-charts-green,var(--vscode-descriptionForeground))]'
          }`}
        />
        <span class="text-[var(--vscode-descriptionForeground)]">{thinking ? 'Thinking…' : 'Idle'}</span>
      </section>

      {/* ------------------------------ Provider ------------------------------ */}
      {/* The Active Provider drives the base URL the key is sent to. Switching re-keys the model
          list and the key hint below — no auto-prompt for a key-less Provider, just the hint. */}
      <section class="flex flex-col gap-1.5">
        <h2 class="section-title">Provider</h2>
        <select
          class="input"
          value={state.providerId}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setState({ ...state, providerId: value }); // optimistic; the state push confirms
            vscode.postMessage({ type: 'selectProvider', value });
          }}
        >
          {state.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {/* Cline ToS (§2.2): user-key only + this note. The responsibility sits with the user. */}
        {state.providerId === 'cline' && (
          <p class="text-xs text-[var(--vscode-descriptionForeground)]">
            You are responsible for your own Cline ToS compliance.
          </p>
        )}
      </section>

      {/* ------------------------------ Base URL (Custom only) ------------------------------ */}
      {/* Only Custom exposes an editable base URL (machine-scoped wisp.baseUrl); built-ins hide it
          and the footer below shows the derived URL. Commit on blur or Enter, not per keystroke. */}
      {state.isCustom && (
        <section class="flex flex-col gap-1.5">
          <h2 class="section-title">Base URL</h2>
          <input
            class="input"
            type="text"
            placeholder="https://your-endpoint/v1"
            value={state.baseUrl}
            onInput={(e) => setState({ ...state, baseUrl: e.currentTarget.value })}
            onBlur={(e) => commitBaseUrl(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitBaseUrl(e.currentTarget.value); }}
          />
        </section>
      )}

      {/* --------------------- Credentials: OAuth sign-in OR API key --------------------- */}
      {/* The OAuth Providers (Codex, Anthropic) have no API key — each is "usable when signed in", so it
          swaps the key field for an account sign-in/out control. Every other Provider keeps the API-key
          field. One block serves both kinds; the label + messages are routed by kind. */}
      {oauth ? (
        <section class="flex flex-col gap-1.5">
          <h2 class="section-title">{accountLabel}</h2>
          <p class="text-[var(--vscode-descriptionForeground)]">
            {state.signedIn ? '● Signed in' : '○ Not signed in'}
          </p>
          <div class="flex gap-1.5">
            <button class="btn" disabled={state.signedIn} onClick={() => vscode.postMessage({ type: signInMsg })}>
              Sign in
            </button>
            <button
              class="btn btn-secondary"
              disabled={!state.signedIn}
              onClick={() => vscode.postMessage({ type: signOutMsg })}
            >
              Sign out
            </button>
          </div>
          <p class="text-xs text-[var(--vscode-descriptionForeground)]">
            {accountHint}
          </p>
        </section>
      ) : (
        <section class="flex flex-col gap-1.5">
          <h2 class="section-title">API Key</h2>
          <p class="text-[var(--vscode-descriptionForeground)]">
            {state.keySource === 'stored' ? '● Key set'
              : state.keySource === 'env' ? `● Using ${state.keyEnv} from environment`
              : '○ No key set'}
          </p>
          <input
            class="input"
            type="password"
            placeholder="Paste API key"
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
      )}

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
          {/* The OAuth kinds have no /models route (not the OpenAI-chat client), so hide the live refresh —
              the user picks from the curated list or types a model id in the field below. */}
          {!oauth && (
            <button
              class="btn btn-secondary shrink-0"
              title="Refresh model list from the endpoint"
              onClick={() => { setModelsError(''); vscode.postMessage({ type: 'refreshModels' }); }}
            >
              ↻
            </button>
          )}
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

      {/* ------------------------------ Effort ------------------------------ */}
      {/* Reasoning depth for the effort-aware OAuth Providers — Codex and Anthropic (#31) — one value
          governing every call (Inquire + chat). Shown whenever the host populates effort; inert for
          models that ignore it (Codex spark/gpt-4.x, Claude Haiku). */}
      {state.effort !== undefined && (
        <section class="flex flex-col gap-1.5">
          <h2 class="section-title">Effort</h2>
          <select
            class="input"
            value={state.effort ?? 'medium'}
            onChange={(e) => {
              const value = e.currentTarget.value as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
              setState({ ...state, effort: value }); // optimistic; the state push confirms
              vscode.postMessage({ type: 'selectEffort', value });
            }}
          >
            {/* Options come from the host so 'max' shows only for max-capable Claude (#32) — no capability
                regex duplicated in this bundle. Fall back to the base set if the host omitted them. */}
            {(state.effortOptions ?? ['low', 'medium', 'high', 'xhigh']).map((o) => (
              <option value={o}>{o}</option>
            ))}
          </select>
        </section>
      )}

      {/* ------------------------------ Bridge ------------------------------ */}
      {/* The outward local OpenAI endpoint. OFF by default; the switch drives the SAME start/stop as the
          command. While running, show the address + access secret (copy host-side) to paste into the CLI. */}
      <section class="flex flex-col gap-1.5">
        <h2 class="section-title">Bridge</h2>
        <div class="flex items-center gap-2">
          <span
            class={`inline-block h-2 w-2 rounded-full ${
              state.bridgeRunning
                ? 'bg-[var(--vscode-charts-green,var(--vscode-descriptionForeground))]'
                : 'bg-[var(--vscode-descriptionForeground)]'
            }`}
          />
          <span class="text-[var(--vscode-descriptionForeground)]">{state.bridgeRunning ? 'Running' : 'Stopped'}</span>
        </div>
        <button class="btn" onClick={() => vscode.postMessage({ type: 'bridgeToggle' })}>
          {state.bridgeRunning ? 'Stop Bridge' : 'Start Bridge'}
        </button>
        {state.bridgeRunning && (
          <div class="flex flex-col gap-1.5">
            <div class="flex gap-1.5">
              <input class="input min-w-0 flex-1" type="text" readonly value={state.bridgeAddress} />
              <button class="btn btn-secondary shrink-0" title="Copy address" onClick={() => vscode.postMessage({ type: 'copyBridgeAddress' })}>Copy</button>
            </div>
            <div class="flex gap-1.5">
              <input class="input min-w-0 flex-1" type="password" readonly value={state.bridgeSecret ?? ''} />
              <button class="btn btn-secondary shrink-0" title="Copy access secret" onClick={() => vscode.postMessage({ type: 'copyBridgeSecret' })}>Copy</button>
            </div>
            <p class="text-xs text-[var(--vscode-descriptionForeground)]">
              Open a new terminal after starting so the Copilot CLI inherits the Bridge.
            </p>
          </div>
        )}

        {/* --------------------- Routing map (#51) --------------------- */}
        {/* The four fixed Family routes: a bridged claude-* id of a family answers with that row's
            Target — the picked Provider plus the pinned model typed here — instead of the Active
            Provider. Provider "Unmapped" (or an empty model) keeps the row explicitly unmapped. */}
        <h3 class="section-title mt-2">Routing map</h3>
        {routeDrafts && FAMILY_KEYS.map((family) => {
          const d = routeDrafts[family];
          const mapped = !!state.routingFamilies?.[family];
          return (
            <div key={family} class="flex items-center gap-1.5">
              <span class={`w-12 shrink-0 text-xs capitalize ${mapped ? '' : 'text-[var(--vscode-descriptionForeground)]'}`}>{family}</span>
              <select
                class="input min-w-0 flex-1"
                value={d.providerId}
                onChange={(e) => {
                  const providerId = e.currentTarget.value;
                  ensureProviderModels(providerId); // pull this Provider's list so the model dropdown fills (#53)
                  commitFamilyRoute(family, { ...d, providerId });
                }}
              >
                <option value="">Unmapped</option>
                {state.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {/* Model: a dropdown when the row Provider's list is known (#53), else the free-text
                  input — configuring a route is never blocked on a fetch. */}
              {rowModelOptions(d.providerId, d.model) ? (
                <select
                  class="input min-w-0 flex-1"
                  value={d.model}
                  onChange={(e) => commitFamilyRoute(family, { providerId: d.providerId, model: e.currentTarget.value })}
                >
                  <option value="">model…</option>
                  {rowModelOptions(d.providerId, d.model)!.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              ) : (
                <input
                  class="input min-w-0 flex-1"
                  type="text"
                  placeholder="model id"
                  value={d.model}
                  onInput={(e) => {
                    const model = e.currentTarget.value;
                    setRouteDrafts((cur) => cur && { ...cur, [family]: { ...cur[family], model } });
                  }}
                  onBlur={(e) => commitFamilyRoute(family, { providerId: d.providerId, model: e.currentTarget.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitFamilyRoute(family, { providerId: d.providerId, model: e.currentTarget.value }); }}
                />
              )}
            </div>
          );
        })}
        <p class="text-xs text-[var(--vscode-descriptionForeground)]">
          Bridged claude-opus / sonnet / haiku / fable names answer with their Target (Provider + pinned model). Unmapped rows use the Active Provider.
        </p>

        {/* Alias rows (#52): user-invented exact names → Target. Saved rows are read-only + removable;
            the draft row below adds one. Names shadowing a Provider id are refused visibly. */}
        {(state.routingAliases ?? []).map((a) => (
          <div key={a.name} class="flex items-center gap-1.5">
            <span class="w-12 shrink-0 truncate text-xs" title={a.name}>{a.name}</span>
            <span class="min-w-0 flex-1 truncate text-xs text-[var(--vscode-descriptionForeground)]" title={`${a.target.providerId} · ${a.target.model}`}>
              {state.providers.find((p) => p.id === a.target.providerId)?.label ?? a.target.providerId} · {a.target.model}
            </span>
            <button class="btn btn-secondary shrink-0" title={`Remove alias ${a.name}`} onClick={() => vscode.postMessage({ type: 'removeAlias', value: { name: a.name } })}>✕</button>
          </div>
        ))}
        <div class="flex items-center gap-1.5">
          <input
            class="input w-12 shrink-0 min-w-0"
            type="text"
            placeholder="alias"
            value={aliasDraft.name}
            onInput={(e) => setAliasDraft({ ...aliasDraft, name: e.currentTarget.value })}
          />
          <select
            class="input min-w-0 flex-1"
            value={aliasDraft.providerId}
            onChange={(e) => {
              const providerId = e.currentTarget.value;
              ensureProviderModels(providerId); // pull this Provider's list so the model dropdown fills (#53)
              setAliasDraft({ ...aliasDraft, providerId });
            }}
          >
            <option value="">Provider…</option>
            {state.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {/* Model: dropdown when the draft Provider's list is known (#53), else free text. */}
          {rowModelOptions(aliasDraft.providerId, aliasDraft.model) ? (
            <select
              class="input min-w-0 flex-1"
              value={aliasDraft.model}
              onChange={(e) => setAliasDraft({ ...aliasDraft, model: e.currentTarget.value })}
            >
              <option value="">model…</option>
              {rowModelOptions(aliasDraft.providerId, aliasDraft.model)!.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          ) : (
            <input
              class="input min-w-0 flex-1"
              type="text"
              placeholder="model id"
              value={aliasDraft.model}
              onInput={(e) => setAliasDraft({ ...aliasDraft, model: e.currentTarget.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') addAlias(); }}
            />
          )}
          <button class="btn btn-secondary shrink-0" disabled={!aliasReady} onClick={addAlias}>Add</button>
        </div>
        {aliasCollides && (
          <p class="text-xs text-[var(--vscode-errorForeground)]">
            '{aliasName}' is a Provider id — pick a different alias name.
          </p>
        )}
        <p class="text-xs text-[var(--vscode-descriptionForeground)]">
          Aliases are exact bridged model names (e.g. /model sol) answering with their Target. They also appear in the Bridge's models list.
        </p>
        {/* Optimistic echo like chooseModel — the config listener's state push confirms; without it an
            unrelated re-render mid-round-trip snaps the checkbox back. */}
        <label class="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={state.aliasPickerShowsModel !== false}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              setState({ ...state, aliasPickerShowsModel: on });
              vscode.postMessage({ type: 'setAliasPickerShowsModel', value: on });
            }}
          />
          Show pinned model next to aliases in Claude Code's /model list
        </label>
        <label class="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={state.aliasOnlyModels === true}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              setState({ ...state, aliasOnlyModels: on });
              vscode.postMessage({ type: 'setAliasOnlyModels', value: on });
            }}
          />
          List only aliases in Claude Code's /model list (hide provider rows)
        </label>

        {/* --------------------- Claude Code setup (#47) --------------------- */}
        {/* Ready-to-copy env snippets pointing Claude Code at the live door. Per-session shell lines are the
            default; the project .claude/settings.json block is the persistent variant. The global
            ~/.claude/settings.json form is deliberately never offered — it would reroute every session. */}
        <h3 class="section-title mt-2">Claude Code</h3>
        {state.claudeSnippets ? (
          <div class="flex flex-col gap-1.5">
            {([
              ['PowerShell (this session)', 'powershell', state.claudeSnippets.powershell],
              ['bash (this session)', 'bash', state.claudeSnippets.bash],
              ['Project .claude/settings.json (persistent)', 'settingsJson', state.claudeSnippets.settingsJson],
            ] as const).map(([label, variant, text]) => (
              <div key={variant} class="flex flex-col gap-1">
                <div class="flex items-center gap-1.5">
                  <span class="min-w-0 flex-1 text-xs text-[var(--vscode-descriptionForeground)]">{label}</span>
                  <button class="btn btn-secondary shrink-0" title={`Copy ${label} snippet`} onClick={() => vscode.postMessage({ type: 'copyClaudeSnippet', value: variant })}>Copy</button>
                </div>
                <pre class="input overflow-x-auto whitespace-pre text-xs">{text}</pre>
              </div>
            ))}
            <p class="text-xs text-[var(--vscode-descriptionForeground)]">
              Claude Code reads env at startup — open a new terminal (or restart claude) after applying.
            </p>
          </div>
        ) : (
          <p class="text-xs text-[var(--vscode-descriptionForeground)]">
            Start the Bridge to get copy-paste setup snippets for Claude Code.
          </p>
        )}
      </section>

      <footer class="text-xs text-[var(--vscode-descriptionForeground)] break-all">
        {state.baseUrl}
      </footer>
    </main>
  );
};
