// ---------------- app.tsx — the Wisp TUI: splash, slash palette, and the three MVP commands ---------------- //

/*
 * Depends on:
 *   - @opentui/react: JSX intrinsics (box/text/input/select) + useKeyboard/usePaste hooks.
 *   - @opentui/core: InputRenderable — ref type for clearing the palette input after a command.
 *   - @wisp/core: PROVIDERS catalog + resolvers, slash parse/suggest, stream clients for /test.
 *   - ./store: the shared ~/.wisp handle + OAuth managers (#63 — extracted so `wisp serve` shares them).
 *   - ./bridge: the TUI's Bridge host wiring (#63).
 *   - ./modes: the Mode union + RouteRow (#116 — extracted so Screen modules can type payloads).
 *   - ./theme: splash/colors/panel/select styling (#116 — the select-transparency landmine's home).
 *   - ./widgets: wrapWords + WrapSelect + onSubmitText (#116/#117 — cross-flow building blocks).
 *   - ./providerScreens: the ten provider-flow Screens + that flow's helpers (#117) — the
 *     shell imports the Screens plus EFFORT_LADDER, fetchModelOptions, oauthProviders, saveKey.
 *   - ./routingScreens: the eight routing-flow Screens + that flow's row helpers (#118) — the
 *     shell imports the Screens plus routingMap, rowLabel, sectionOf, CLAUDE_FAMILY_MODELS.
 *
 * Data shapes:
 *   - Mode + RouteRow: imported from ./modes — the screen state machine this shell owns and
 *     drives. Every non-input mode returns to 'input' on Esc, except the routing screens,
 *     which step back one level: sub-screen → its section → overview → palette.
 */

import { useRef, useState } from 'react';
import { useKeyboard, usePaste, useRenderer, useTerminalDimensions } from '@opentui/react';
import type { InputRenderable } from '@opentui/core';
import {
  PROVIDERS, SLASH_COMMANDS, parseSlash, suggestSlash, resolveBaseUrl, resolveKeyId, resolveModel,
  isCodexProvider, isAnthropicProvider, isXaiProvider,
  DEFAULT_EFFORT, isAnthropicSignedIn, effectiveAliasOnly,
  resolveRoute, EMPTY_ROUTING_MAP, codexStream, anthropicStream, xaiStream, sseBlocks,
  chatCompletionTextDelta, standardEffortToCodex,
  FAMILY_KEYS, withFamilyRoute, withAlias, withoutAlias,
  type Provider, type EffortLevel, type Target,
} from '@wisp/core';
import { home, activeProvider, codexAuth, anthropicAuth, xaiAuth } from './store';
import { createTuiBridge, ensureBridgeSecret, bridgeAddress, bridgePort } from './bridge';
import type { Mode, RouteRow } from './modes';
import { SPLASH, ACCENT, DIM, PANEL, SELECT_COLORS } from './theme';
import { wrapWords, onSubmitText } from './widgets';
import {
  EFFORT_LADDER, fetchModelOptions, oauthProviders, saveKey,
  ProvidersScreen, ProviderMenuScreen, KeyPickScreen, KeyEntryScreen, ModelLoadingScreen,
  ModelPickScreen, ModelFreeScreen, OauthPickScreen, SigninWaitScreen, EffortPickScreen,
} from './providerScreens';
import {
  routingMap, rowLabel, sectionOf, CLAUDE_FAMILY_MODELS,
  RoutingScreen, RoutingSectionScreen, AliasNameScreen, AliasRenameScreen, RouteProviderScreen,
  RouteModelLoadingScreen, RouteModelPickScreen, RouteModelFreeScreen,
} from './routingScreens';
import pkg from '../package.json';

// ----------------------------------------- Store ----------------------------------------- //

// The store handle + OAuth managers moved to store.ts with #63 (shared with `wisp serve`);
// the provider flow's key/model storage helpers, EFFORT_LADDER, and fetchModelOptions moved
// to providerScreens.tsx with #117 — the shell imports what its starters need.

// ----------------------------------------- /routing ----------------------------------------- //

// The routing-row helpers moved to routingScreens.tsx with #118 — the shell's starters import
// routingMap/rowLabel/sectionOf/CLAUDE_FAMILY_MODELS from there.

// ----------------------------------------- /test ----------------------------------------- //

// The wiring check's canned prompt — proves the round trip, nothing more (#62: not a chat).
const TEST_PROMPT = 'Reply with one short sentence confirming you can hear me.';

// Fire the canned prompt through one Provider and yield raw answer-text deltas. Dispatch mirrors the
// Bridge's three kinds (bridgeServer.startProviderStream): Codex → Responses stream, Anthropic →
// Messages stream, keyed → plain fetch on <base>/chat/completions. Failures throw with the Provider's
// real message — the caller renders them loud, never falls back. Exported so the wiring check itself
// can be exercised headless (no TTY) — the screen around it is plain state rendering.
export async function* streamTestReply(p: Provider, model: string, signal: AbortSignal): AsyncGenerator<string> {
  const cfg = home.readConfig();
  const baseUrl = resolveBaseUrl(p, cfg.customBaseUrl ?? '');
  const message = { role: 'user' as const, content: TEST_PROMPT };
  if (isCodexProvider(p)) {
    const creds = await codexAuth.current();
    if (!creds) throw new Error(`${p.label} is not signed in — /signin codex.`);
    for await (const ev of codexStream({ creds, baseUrl, model, messages: [message], effort: standardEffortToCodex(cfg.effort ?? DEFAULT_EFFORT), signal }))
      if (ev.type === 'text') yield ev.value;
    return;
  }
  if (isAnthropicProvider(p)) {
    const creds = await anthropicAuth.current();
    if (!creds) throw new Error(`${p.label} is not signed in — /signin anthropic.`);
    for await (const ev of anthropicStream({ creds, baseUrl, model, messages: [message], effort: cfg.effort ?? DEFAULT_EFFORT, signal }))
      if (ev.type === 'text') yield ev.value;
    return;
  }
  if (isXaiProvider(p)) {
    const creds = await xaiAuth.current();
    if (!creds) throw new Error(`${p.label} is not signed in — /signin xai.`);
    // baseUrl is the row's proxy base; xaiStream routes grok-4.5 to api.x.ai itself. effort stays the
    // shared EffortLevel — xaiReasoning gates per model.
    for await (const ev of xaiStream({ creds, baseUrl, model, messages: [message], effort: cfg.effort ?? DEFAULT_EFFORT, signal }))
      if (ev.type === 'text') yield ev.value;
    return;
  }
  if (!baseUrl) throw new Error('Custom has no base URL configured.');
  // Keyless rows (local Ollama) send bare on purpose — a backend that wanted a key answers 401, and
  // that status+body IS the loud error this check exists to surface. No local key gate.
  const key = home.readAuth().keys?.[resolveKeyId(p)] || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages: [message], stream: true }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${p.label} API error ${res.status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : '.'}`);
  }
  if (!res.body) return;
  for await (const block of sseBlocks(res.body)) {
    const delta = chatCompletionTextDelta(block);
    if (delta) yield delta;
  }
}

// ----------------------------------------- Bridge ----------------------------------------- //

// One host instance for the session — /bridge toggles it. Log is dropped like the auth managers'
// (no output channel in a raw-mode TUI); the bridge screen shows the state instead. The listener
// dies with the process on /quit — headless hosting is `wisp serve`, not a TUI leftover.
const bridge = createTuiBridge(() => {});

// ----------------------------------------- App ----------------------------------------- //

export const App = () => {
  const [mode, setMode] = useState<Mode>({ kind: 'input' });
  const [line, setLine] = useState('');       // live palette input, drives suggestions
  const [selIdx, setSelIdx] = useState(0);    // palette highlight — Up/Down move it, Enter runs it
  const [secret, setSecret] = useState('');   // key-entry buffer — rendered only as bullets
  const [status, setStatus] = useState('');
  const inputRef = useRef<InputRenderable>(null);
  const signinSeq = useRef(0); // bumped on cancel so a late OAuth resolve can't yank a later screen
  const testSeq = useRef(0);   // same guard for /test — a late delta/finish can't touch a later screen
  const testAbort = useRef<AbortController | null>(null);
  const bridgeStarting = useRef(false); // in-flight bind guard — see the /bridge case
  const renderer = useRenderer();
  // Live text columns for the hand-wrap helpers: terminal minus the outer padding (2+2) and the
  // PANEL border (1+1). Floored so a pathological width can't produce empty wraps.
  const { width: termWidth } = useTerminalDimensions();
  const panelCols = Math.max(termWidth - 6, 20);
  // Palette suggestion rows sit outside any PANEL — only the outer padding (2+2) eats width.
  const paletteCols = Math.max(termWidth - 4, 20);

  // Bare process.exit skips opentui's teardown and strands the terminal in raw mode /
  // the alternate screen — destroy the renderer first, always.
  const exitTui = () => { renderer.destroy(); process.exit(0); };

  const backToInput = (message?: string) => {
    if (message) setStatus(message);
    setSecret('');
    setMode({ kind: 'input' });
  };

  // Menu actions land back on the LIST (#106) — manage several providers in one visit; the
  // re-render also makes the (active) marker and key/auth statuses reflect what just happened.
  const backToProviders = (message?: string) => {
    if (message) setStatus(message);
    setSecret('');
    setMode({ kind: 'providers' });
  };

  // Esc from a menu-origin screen steps back ONE level — to the menu, not the list.
  const backToMenu = (p: Provider) => {
    setSecret('');
    setMode({ kind: 'provider-menu', provider: p });
  };

  // The /routing sub-screens step back one level on Esc/apply — to the SECTION they came from
  // (#79), not the palette: editing several rows in a row is the normal flow. Origin is derivable
  // (family rows → Claude Code section, alias screens → Custom), so no extra mode state.
  const backToSection = (section: 'families' | 'aliases', message?: string) => {
    if (message) setStatus(message);
    setMode({ kind: 'routing-section', section });
  };

  // Persist one row's new Target through core's pure edits. A refusal (only reachable if a Provider
  // id slipped past the alias-name precheck) persists nothing.
  const applyRoute = (row: RouteRow, target: Target) => {
    const map = routingMap();
    const next = row.kind === 'family'
      ? withFamilyRoute(map, PROVIDERS, row.family, target)
      : withAlias(map, PROVIDERS, row.name, target);
    if (next) home.writeConfig({ routing: next });
    backToSection(sectionOf(row), next ? `${rowLabel(row)} → ${target.providerId} (${target.model})` : 'Refused — that name is a Provider id.');
  };

  // The picker's last entry: clear a Family route / remove an Alias.
  const clearRow = (row: RouteRow) => {
    const map = routingMap();
    if (row.kind === 'family') {
      // Clearing can't be refused — withFamilyRoute only refuses a dangling Target.
      home.writeConfig({ routing: withFamilyRoute(map, PROVIDERS, row.family, undefined)! });
      backToSection('families', `${row.family} route cleared.`);
    } else {
      home.writeConfig({ routing: withoutAlias(map, row.name) });
      backToSection('aliases', `Alias ${row.name} removed.`);
    }
  };

  // Fetch the row Provider's model list, then land on pick or free text. The guard compares the row
  // by REFERENCE — only the flow that set this loading mode may resolve it, so an Esc'd or replaced
  // fetch is discarded (same race as /model, sharper check).
  const startRouteModel = (row: RouteRow, p: Provider) => {
    setMode({ kind: 'route-model-loading', row, provider: p });
    void fetchModelOptions(p).then((options) =>
      setMode((m) => m.kind !== 'route-model-loading' || m.row !== row ? m
        : options ? { kind: 'route-model-pick', row, provider: p, options }
        : { kind: 'route-model-free', row, provider: p }));
  };

  // Kick off the browser OAuth flow and park on the wait screen. The seq guard mirrors the model-fetch
  // race fix: Esc bumps it, so an abandoned flow resolving minutes later can't rewrite the UI.
  // onSuccess lets a caller chain work after the tokens land (the routing bind) — default just reports.
  // origin rides into the wait mode so Esc steps back into the menu flow (#106).
  const startSignIn = (p: Provider, onSuccess?: () => void, origin?: 'menu') => {
    const seq = ++signinSeq.current;
    setMode({ kind: 'signin-wait', provider: p, origin });
    const auth = isCodexProvider(p) ? codexAuth : isAnthropicProvider(p) ? anthropicAuth : xaiAuth;
    auth.signIn().then(
      () => { if (seq === signinSeq.current) (onSuccess ?? (() => backToInput(`Signed in — ${p.label} is ready.`)))(); },
      (err) => { if (seq === signinSeq.current) backToInput(`Sign-in failed: ${err instanceof Error ? err.message : String(err)}`); },
    );
  };

  // The families screen's one-tap bind: point all four Family routes at the Anthropic subscription
  // models. Signed out → run the browser sign-in first and bind the moment the tokens land.
  const bindClaudeFamilies = () => {
    const p = PROVIDERS.find(isAnthropicProvider);
    if (!p) return;
    const apply = () => {
      // withFamilyRoute can't refuse here — the Target names a catalog row by construction.
      let map = routingMap();
      for (const f of FAMILY_KEYS) map = withFamilyRoute(map, PROVIDERS, f, { providerId: p.id, model: CLAUDE_FAMILY_MODELS[f] })!;
      home.writeConfig({ routing: map });
      // short on purpose — the status row is single-line chrome that clips on narrow terminals
      backToSection('families', `Families → ${p.label} subscription models.`);
    };
    isAnthropicSignedIn(home.readAuth().anthropic) ? apply() : startSignIn(p, apply);
  };

  // Sign-out is instant — core writes the {} tombstone (which also suppresses the ~/.codex re-import).
  const doSignOut = (p: Provider, origin?: 'menu') => {
    (isCodexProvider(p) ? codexAuth : isAnthropicProvider(p) ? anthropicAuth : xaiAuth).signOut();
    (origin === 'menu' ? backToProviders : backToInput)(`Signed out of ${p.label}.`);
  };

  // Stream the canned /test prompt onto the test screen. Unlike sign-in, Esc aborts the request
  // itself (there's no browser flow to let finish) — the seq guard still gates every state write.
  const startTest = (p: Provider, model: string) => {
    const seq = ++testSeq.current;
    const controller = new AbortController();
    testAbort.current = controller;
    setMode({ kind: 'test', provider: p, model, text: '', phase: 'streaming' });
    (async () => {
      let sawText = false;
      for await (const delta of streamTestReply(p, model, controller.signal)) {
        if (!delta) continue;
        if (seq !== testSeq.current) return false;
        sawText = true;
        setMode((m) => m.kind === 'test' ? { ...m, text: m.text + delta } : m);
      }
      return sawText;
    })().then(
      // A stream that ends having yielded nothing proved nothing — that's a failure, not a pass
      // (a 200 that ignored stream:true, an empty body, an error frame all land here).
      (sawText) => {
        if (seq !== testSeq.current) return;
        setMode((m) => m.kind !== 'test' ? m
          : sawText ? { ...m, phase: 'done' }
          : { ...m, phase: 'error', error: 'Stream ended with no reply — nothing was received.' });
      },
      (err) => { if (seq === testSeq.current) setMode((m) => m.kind === 'test' ? { ...m, phase: 'error', error: err instanceof Error ? err.message : String(err) } : m); },
    );
  };

  // ----- command dispatch (Enter in the palette) -----
  const runCommand = (raw: string) => {
    const parsed = parseSlash(raw);
    if (!parsed) { setStatus(raw.trim() ? 'Not a command — type / for the palette.' : ''); return; }
    // A unique partial match completes on Enter — that IS the autocomplete contract (/pr → /providers).
    const exact = SLASH_COMMANDS.some((c) => c.name === parsed.command);
    const unique = suggestSlash(`/${parsed.command}`);
    const command = exact ? parsed.command : unique.length === 1 ? unique[0].name : parsed.command;
    const target = parsed;

    if (inputRef.current) inputRef.current.value = '';
    setLine('');

    // /modelids made some prefixes ambiguous (#82: /mode ↔ /model, /modelids) — name the
    // candidates instead of the misleading "Unknown command".
    if (!exact && unique.length > 1) { setStatus(`Ambiguous — did you mean ${unique.map((c) => `/${c.name}`).join(' or ')}?`); return; }

    const byId = (id?: string) => PROVIDERS.find((p) => p.id === id);
    switch (command) {
      case 'providers': setMode({ kind: 'providers' }); return;
      case 'routing': setMode({ kind: 'routing' }); return;
      case 'key': {
        const p = target.args[0] ? byId(target.args[0]) : undefined;
        if (target.args[0] && !p) { setStatus(`Unknown provider: ${target.args[0]}`); return; }
        // OAuth rows sign in, they don't take keys — same filter the picker applies.
        if (p && (isCodexProvider(p) || isAnthropicProvider(p))) {
          setStatus(`${p.label} uses OAuth — try /signin ${p.id}.`); return;
        }
        // A key typed inline was echoed on screen — refuse it and open the masked field instead.
        if (target.args[1]) setStatus('Never paste keys in the palette — enter it masked below.');
        setMode(p ? { kind: 'key-entry', provider: p } : { kind: 'key-pick' });
        return;
      }
      case 'model': {
        const p = (target.args[0] ? byId(target.args[0]) : activeProvider());
        if (!p) { setStatus(`Unknown provider: ${target.args[0]}`); return; }
        setMode({ kind: 'model-loading', provider: p });
        // Guard on provider id too — an Esc + second /model must not let the slow first fetch win.
        void fetchModelOptions(p).then((options) =>
          setMode((m) => m.kind !== 'model-loading' || m.provider.id !== p.id ? m
            : options ? { kind: 'model-pick', provider: p, options }
            : { kind: 'model-free', provider: p }));
        return;
      }
      case 'signin':
      case 'signout': {
        const arg = target.args[0]?.toLowerCase();
        // Match by kind, not id, so the arg names the door (codex/anthropic/xai) rather than a catalog row.
        const p = arg
          ? oauthProviders().find((x) => (arg === 'codex' && isCodexProvider(x)) || (arg === 'anthropic' && isAnthropicProvider(x)) || (arg === 'xai' && isXaiProvider(x)))
          : undefined;
        if (arg && !p) { setStatus(`/${command} takes codex, anthropic, or xai — got: ${target.args[0]}`); return; }
        if (!p) { setMode({ kind: 'oauth-pick', action: command }); return; }
        command === 'signin' ? startSignIn(p) : doSignOut(p);
        return;
      }
      case 'effort': {
        const arg = target.args[0]?.toLowerCase();
        if (arg) {
          if (!(EFFORT_LADDER as string[]).includes(arg)) { setStatus(`Effort is one of: ${EFFORT_LADDER.join(' / ')}`); return; }
          home.writeConfig({ effort: arg as EffortLevel });
          setStatus(`Effort → ${arg}`);
          return;
        }
        setMode({ kind: 'effort-pick' });
        return;
      }
      case 'test': {
        const name = target.args[0];
        if (!name) { setStatus('Usage: /test <provider|alias>'); return; }
        const cfg = home.readConfig();
        // Empty active id on purpose: /test names its target explicitly, so an unknown name errors
        // here instead of resolveRoute's silent Active-Provider fallback (#62 acceptance).
        const route = resolveRoute(cfg.routing ?? EMPTY_ROUTING_MAP, PROVIDERS, '', name);
        if (!route) { setStatus(`Unknown provider or alias: ${name}`); return; }
        // An Alias Target's pinned model beats the Provider's remembered model — same rule as the Bridge.
        startTest(route.provider, route.pinnedModel ?? resolveModel(cfg.models ?? {}, route.provider));
        return;
      }
      case 'bridge': {
        if (bridge.isRunning()) { bridge.stop(); setStatus('Bridge stopped.'); return; }
        // isRunning() stays false until the bind lands, so without this guard a double /bridge would
        // race a second server onto the same port and orphan the first one's handle.
        if (bridgeStarting.current) { setStatus('Bridge is starting…'); return; }
        bridgeStarting.current = true;
        bridge.start().then(
          () => {
            bridgeStarting.current = false;
            const info = { kind: 'bridge' as const, address: bridgeAddress(), secret: ensureBridgeSecret() };
            // Show the info screen only if the user is still on the palette (a slow bind must not yank a
            // screen they navigated to) — the status line announces the start wherever they are.
            setMode((m) => m.kind === 'input' ? info : m);
            setStatus('Bridge started — /bridge again to stop.');
          },
          (err) => {
            bridgeStarting.current = false;
            const message = err instanceof Error ? err.message : String(err);
            // Port collision = the other face (or another wisp) already hosts the shared port — loud, no
            // port-hop. Bun's bind error says "in use" without an EADDRINUSE code, hence the message probe.
            setStatus((err as { code?: string }).code === 'EADDRINUSE' || /EADDRINUSE|in use/i.test(message)
              ? `Bridge port ${bridgePort()} is already in use — is VS Code (or another wisp) already hosting it?`
              : `Bridge failed to start: ${message}`);
          });
        return;
      }
      case 'aliasonly': {
        // Claude Code's /model list: aliases only on/off (#67, on by default #81 — toggle base is
        // the EFFECTIVE state so the first bare /aliasonly on a fresh install turns it off). No
        // zero-alias guard: the Bridge list falls back to Provider rows, never empty. No arg
        // toggles; the running Bridge reads the flag live per list request, so no restart needed.
        const arg = target.args[0]?.toLowerCase();
        if (arg && arg !== 'on' && arg !== 'off') { setStatus('/aliasonly takes on or off'); return; }
        const cfg = home.readConfig();
        const on = arg ? arg === 'on' : !effectiveAliasOnly(cfg);
        home.writeConfig({ bridge: { ...cfg.bridge, aliasOnlyModels: on } });
        // Echo stays honest with zero aliases — the served list falls back to Provider rows.
        setStatus(!on ? 'Claude Code /model list → Providers + aliases.'
          : routingMap().aliases.length === 0 ? 'Claude Code /model list → aliases only (Providers shown until the first alias — add one in /routing).'
          : 'Claude Code /model list → aliases only.');
        return;
      }
      case 'modelids': {
        // Alias rows' pinned-model-id suffix on/off (#82) — exact twin of /aliasonly; the Bridge
        // reads the preference live per list request, so no restart is needed.
        const arg = target.args[0]?.toLowerCase();
        if (arg && arg !== 'on' && arg !== 'off') { setStatus('/modelids takes on or off'); return; }
        const cfg = home.readConfig();
        const on = arg ? arg === 'on' : !(cfg.bridge?.aliasPickerShowsModel ?? true);
        home.writeConfig({ bridge: { ...cfg.bridge, aliasPickerShowsModel: on } });
        setStatus(on ? 'Alias rows show their pinned model id.' : 'Alias rows show bare names.');
        return;
      }
      case 'help': setMode({ kind: 'help' }); return;
      case 'quit': exitTui(); return;
      default: setStatus(`Unknown command: /${command}`);
    }
  };

  // ----- palette submit (Enter) — with the suggestion list open, Enter fires the HIGHLIGHTED row,
  // not the raw prefix (Up/Down picked it). A required-arg command (<…>) completes into the input
  // instead of firing bare — it still owes an argument. Closed list falls through to runCommand. -----
  const submitLine = (raw: string) => {
    const open = suggestSlash(raw);
    if (open.length === 0) { runCommand(raw); return; }
    const pick = open[Math.min(selIdx, open.length - 1)];
    setSelIdx(0);
    if (pick.args?.startsWith('<')) {
      // the value setter re-emits onInput, so `line` follows without an extra setLine here
      if (inputRef.current) inputRef.current.value = `/${pick.name} `;
      return;
    }
    runCommand(`/${pick.name}`);
  };

  // ----- global keys: Esc backs out of any screen (exits from the palette); key-entry is hand-read
  // here because <input> has no masked variant — chars land in `secret`, never on screen. -----
  useKeyboard((key) => {
    // Up/Down steer the palette highlight while the suggestion list is open (wraps at the ends).
    if (mode.kind === 'input' && (key.name === 'up' || key.name === 'down')) {
      const n = suggestSlash(line).length;
      if (n === 0) return;
      setSelIdx((i) => {
        const cur = Math.min(i, n - 1); // typing may have shrunk the list under a stale index
        return key.name === 'up' ? (cur + n - 1) % n : (cur + 1) % n;
      });
      return;
    }
    if (key.name === 'escape') {
      // ponytail: Esc detaches the UI only — the loopback waits out its own 5-min timeout, and a flow
      // the user still finishes in the browser lands tokens anyway; add a signIn cancel handle if it bites.
      if (mode.kind === 'signin-wait') signinSeq.current++; // invalidate the pending flow's UI claim
      if (mode.kind === 'test') { testSeq.current++; testAbort.current?.abort(); } // kill the request too
      // Routing steps back one level per Esc (#79): sub-screen → its section → overview → palette.
      // The provider-menu chain does the same (#106): entry/wait → menu → list → palette.
      mode.kind === 'input' ? exitTui()
        : mode.kind === 'provider-menu' ? backToProviders()
        : mode.kind === 'key-entry' && mode.origin === 'menu' ? backToMenu(mode.provider)
        : mode.kind === 'signin-wait' && mode.origin === 'menu' ? backToMenu(mode.provider)
        : mode.kind === 'alias-name' || mode.kind === 'alias-rename' ? backToSection('aliases', 'Cancelled.')
        : mode.kind === 'route-provider' || mode.kind === 'route-model-loading' || mode.kind === 'route-model-pick' || mode.kind === 'route-model-free'
          ? backToSection(sectionOf(mode.row), 'Cancelled.')
        : mode.kind === 'routing-section' ? setMode({ kind: 'routing' })
        : mode.kind === 'test' && mode.phase !== 'streaming' ? backToInput() // finished screen just closes
        : mode.kind === 'bridge' || mode.kind === 'help' ? backToInput() // info screens just close — nothing to cancel
        : backToInput('Cancelled.');
      return;
    }
    if (mode.kind !== 'key-entry') return;
    if (key.name === 'return' || key.name === 'enter') {
      // Menu-origin entries finish back on the provider list (#106); /key keeps the palette.
      const done = mode.origin === 'menu' ? backToProviders : backToInput;
      const value = secret.trim();
      if (!value) { done('Empty — key unchanged.'); return; }
      saveKey(mode.provider, value);
      done(`Key saved for ${mode.provider.label}.`);
      return;
    }
    if (key.name === 'backspace') { setSecret((s) => s.slice(0, -1)); return; }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta && key.sequence >= ' ') {
      setSecret((s) => s + key.sequence);
    }
  });

  // Keys are usually pasted, and bracketed paste bypasses keypress events entirely.
  usePaste((event) => {
    if (mode.kind !== 'key-entry') return;
    const text = new TextDecoder().decode(event.bytes).replace(/\s/g, '');
    if (text) setSecret((s) => s + text);
  });

  const suggestions = mode.kind === 'input' ? suggestSlash(line) : [];
  // selIdx can outlive a shrinking list (typing filters it) — clamp at read; onInput resets it
  const highlight = Math.min(selIdx, Math.max(suggestions.length - 1, 0));

  return (
    <box flexDirection="column" padding={2}>
      {/* wrapMode none + flexShrink 0 on EVERY chrome row in this file — a wrapped row makes
          opentui overlay every row after it on narrow terminals, and a short terminal makes yoga
          shrink rows to zero height while they still paint (same garble). Clipping always beats
          garbage. Long chrome copy that must survive narrow terminals is hand-wrapped via
          wrapWords into per-line rows instead. Only real content keeps opentui wrapping: the
          /test reply + its error text. */}
      <text wrapMode="none" flexShrink={0} fg={ACCENT}>{SPLASH}</text>
      {/* the green badge is THIS face's own listener only — start/stop re-render via their setStatus */}
      <text wrapMode="none" flexShrink={0} fg={DIM}>BYOK model router · v{pkg.version}{bridge.isRunning() ? <span fg="#4ade80"> · bridge up :{bridgePort()}</span> : null}</text>

      {mode.kind === 'input' && (
        <>
          {/* no border title — the wordmark above already brands the box; inner padding = chunkier bar */}
          <box {...PANEL} marginTop={1} padding={1}>
            <input
              ref={inputRef}
              placeholder="Type / for commands"
              focused
              onInput={(value: string) => { setLine(value); setSelIdx(0); }}
              onSubmit={onSubmitText(submitLine)}
            />
          </box>
          <box flexDirection="column" marginTop={1}>
            {suggestions.flatMap((c, i) => {
              const on = i === highlight;
              const bg = on ? '#27272a' : undefined;
              const head = `/${c.name}${c.args ? ` ${c.args}` : ''}`;
              // A row that fits stays one line; a clipped one splits into a command line plus
              // hand-wrapped dim description lines (same rule as WrapSelect — opentui's own wrap
              // garbles every row below it). 2 = the highlight prefix, 3 = ' — '.
              if (2 + head.length + 3 + c.description.length <= paletteCols) {
                return [
                  <text key={c.name} wrapMode="none" flexShrink={0} bg={bg}>
                    {on ? <span fg={ACCENT}>{'> '}</span> : '  '}
                    <span fg={ACCENT}>/{c.name}</span>{c.args ? ` ${c.args}` : ''} <span fg={DIM}>— {c.description}</span>
                  </text>,
                ];
              }
              return [
                <text key={c.name} wrapMode="none" flexShrink={0} bg={bg}>
                  {on ? <span fg={ACCENT}>{'> '}</span> : '  '}
                  <span fg={ACCENT}>/{c.name}</span>{c.args ? ` ${c.args}` : ''}
                </text>,
                ...wrapWords(c.description, Math.max(paletteCols - 4, 10)).map((l, j) => (
                  <text key={`${c.name}:${j}`} wrapMode="none" flexShrink={0} bg={bg} fg={DIM}>{`    ${l}`}</text>
                )),
              ];
            })}
          </box>
        </>
      )}

      {mode.kind === 'providers' && (
        <ProvidersScreen onPick={(p) => setMode({ kind: 'provider-menu', provider: p })} />
      )}

      {mode.kind === 'provider-menu' && (
        <ProviderMenuScreen
          provider={mode.provider}
          onDone={backToProviders}
          onSetKey={() => setMode({ kind: 'key-entry', provider: mode.provider, origin: 'menu' })}
          onSignIn={() => startSignIn(mode.provider, () => backToProviders(`Signed in — ${mode.provider.label} is ready.`), 'menu')}
          onSignOut={() => doSignOut(mode.provider, 'menu')}
        />
      )}

      {mode.kind === 'key-pick' && (
        <KeyPickScreen onPick={(p) => setMode({ kind: 'key-entry', provider: p })} />
      )}

      {mode.kind === 'key-entry' && <KeyEntryScreen provider={mode.provider} secret={secret} />}

      {mode.kind === 'model-loading' && <ModelLoadingScreen provider={mode.provider} />}

      {mode.kind === 'model-pick' && (
        <ModelPickScreen provider={mode.provider} options={mode.options} onDone={backToInput} />
      )}

      {mode.kind === 'model-free' && <ModelFreeScreen provider={mode.provider} onDone={backToInput} />}

      {mode.kind === 'oauth-pick' && (
        <OauthPickScreen action={mode.action} onSignIn={startSignIn} onSignOut={doSignOut} />
      )}

      {mode.kind === 'signin-wait' && <SigninWaitScreen provider={mode.provider} />}

      {mode.kind === 'test' && (
        // plain-ASCII title on purpose — opentui border titles drop non-ASCII (em-dash/·), see gotchas
        <box {...PANEL} title={`/test: ${mode.provider.label} (${mode.model})`} marginTop={1} flexDirection="column">
          {/* raw reply text, streamed as-is — deliberately no markdown, no history (#62) */}
          {mode.text !== '' && <text>{mode.text}</text>}
          {mode.phase === 'streaming' && <text wrapMode="none" fg={DIM}>{mode.text === '' ? 'Waiting for the first token… ' : ''}Esc to cancel.</text>}
          {mode.phase === 'done' && <text wrapMode="none" fg={DIM}>Done — Esc to close.</text>}
          {mode.phase === 'error' && <text fg="#f87171">{mode.error}</text>}
        </box>
      )}

      {mode.kind === 'bridge' && (
        <box {...PANEL} title="Bridge" marginTop={1} padding={1} flexDirection="column">
          {/* status header first — state + port at a glance, then the connection facts (#80).
              Always "up" by construction: this mode is only entered post-bind, and no stop path
              exists without leaving the screen. Port derives from the frozen address so the header
              can't contradict the copy-paste lines below after an external config edit.
              Layout rule: every row is single-purpose with wrapMode none — a wrapped row made
              opentui overlay every row after it on narrow terminals (the old chaos); clipping
              beats garbage. The settings.json snippet block was cut for the same reason — its
              75-col rows were the widest offender; claude-wisp is the one shipped connect path,
              and the VS Code side panel still renders the full snippet (core builder untouched). */}
          <text wrapMode="none"><span fg="#4ade80">● up</span><span fg={DIM}> · port {mode.address.slice(mode.address.lastIndexOf(':') + 1)}</span></text>

          <box marginTop={1} flexDirection="column">
            <text wrapMode="none"><span fg={DIM}>{'OpenAI door'.padEnd(16)}</span><span fg={ACCENT}>{mode.address}/v1</span></text>
            <text wrapMode="none"><span fg={DIM}>{'Anthropic door'.padEnd(16)}</span><span fg={ACCENT}>{mode.address}</span></text>
            <text wrapMode="none"><span fg={DIM}>{'Access secret'.padEnd(16)}</span><span fg={ACCENT}>{mode.secret}</span></text>
          </box>

          <box marginTop={1} flexDirection="column">
            <text wrapMode="none"><span fg={DIM}>{'Claude Code'.padEnd(16)}</span>claude-wisp [args…]</text>
            <text wrapMode="none" fg={DIM}>{''.padEnd(16)}launches claude wired to this Bridge</text>
          </box>

          {/* Advisor is endpoint-gated upstream — its calls never hit the configurable base URL,
              so the Bridge can't intercept them and no fix exists on our side. Warn here, where
              Claude Code gets wired. Hand-wrapped (panel rows never use opentui wrap); -2 = the
              panel's inner padding. Plain-text amber, no glyph — ⚠ is ambiguous-width and smears
              on common Windows fonts, same reason the select indicator is off. */}
          <box marginTop={1} flexDirection="column">
            {wrapWords("Heads up: Claude Code's Advisor won't work through Wisp even when bound to Claude OAuth — it's endpoint-gated upstream. Use native claude for advisor tasks.", panelCols - 2)
              .map((l, i) => <text key={i} wrapMode="none" flexShrink={0} fg="#fbbf24">{l}</text>)}
          </box>

          <text wrapMode="none" fg={DIM} marginTop={1}>Esc closes — listener stays up · /bridge stops · /quit kills</text>
        </box>
      )}

      {mode.kind === 'help' && (
        <box {...PANEL} title="Commands" marginTop={1} flexDirection="column">
          {/* rendered FROM the shared registry (#82) — the palette's autocomplete and this list
              can never disagree. A select, not plain rows: 13+ commands clip a 24-row terminal,
              and the select brings the same height cap + scroll the other pickers use. Enter
              only closes — firing (or toggling!) a command from a help list would surprise. */}
          <select
            focused
            {...SELECT_COLORS}
            height={Math.min(SLASH_COMMANDS.length * 2, 12)}
            showSelectionIndicator={false}
            showScrollIndicator
            options={SLASH_COMMANDS.map((c) => ({ name: `/${c.name}${c.args ? ` ${c.args}` : ''}`, description: c.description, value: c.name }))}
            onSelect={() => backToInput()}
          />
          <text wrapMode="none" fg={DIM} marginTop={1}>Enter or Esc closes.</text>
        </box>
      )}

      {mode.kind === 'routing' && (
        <RoutingScreen cols={panelCols} onPick={(section) => setMode({ kind: 'routing-section', section })} />
      )}

      {mode.kind === 'routing-section' && (
        <RoutingSectionScreen
          section={mode.section}
          cols={panelCols}
          onAddAlias={() => setMode({ kind: 'alias-name' })}
          onBind={bindClaudeFamilies}
          onPickRow={(row) => setMode({ kind: 'route-provider', row })}
        />
      )}

      {mode.kind === 'alias-name' && (
        <AliasNameScreen
          onBack={(message) => backToSection('aliases', message)}
          onStatus={setStatus}
          onNamed={(name) => setMode({ kind: 'route-provider', row: { kind: 'alias', name } })}
        />
      )}

      {mode.kind === 'alias-rename' && (
        <AliasRenameScreen
          name={mode.name}
          onBack={(message) => backToSection('aliases', message)}
          onStatus={setStatus}
        />
      )}

      {mode.kind === 'route-provider' && (
        <RouteProviderScreen
          row={mode.row}
          cols={panelCols}
          onClear={() => clearRow(mode.row)}
          onRename={(name) => setMode({ kind: 'alias-rename', name })}
          onPick={(p) => startRouteModel(mode.row, p)}
        />
      )}

      {mode.kind === 'route-model-loading' && <RouteModelLoadingScreen provider={mode.provider} />}

      {mode.kind === 'route-model-pick' && (
        <RouteModelPickScreen
          row={mode.row}
          provider={mode.provider}
          options={mode.options}
          onApply={(target) => applyRoute(mode.row, target)}
        />
      )}

      {mode.kind === 'route-model-free' && (
        <RouteModelFreeScreen
          row={mode.row}
          provider={mode.provider}
          onApply={(target) => applyRoute(mode.row, target)}
          onEmpty={() => backToSection(sectionOf(mode.row), 'Empty — route unchanged.')}
        />
      )}

      {mode.kind === 'effort-pick' && <EffortPickScreen onDone={backToInput} />}

      {/* feedback wraps by hand too — tips and bind confirmations outgrow narrow windows */}
      {status !== '' && (
        <box flexDirection="column" marginTop={1} flexShrink={0}>
          {wrapWords(status, termWidth - 4).map((l, i) => <text key={i} wrapMode="none" flexShrink={0} fg={DIM}>{l}</text>)}
        </box>
      )}
    </box>
  );
};
