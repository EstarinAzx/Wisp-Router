// ---------------- app.tsx — the Wisp TUI: splash, slash palette, and the three MVP commands ---------------- //

/*
 * Depends on:
 *   - @opentui/react: JSX intrinsics (box/text/input/select) + useKeyboard/usePaste hooks.
 *   - @opentui/core: InputRenderable — ref type for clearing the palette input after a command.
 *   - @wisp/core: PROVIDERS catalog + resolvers, slash parse/suggest, oauthModelOptions +
 *     getModelsDevCatalog for the OAuth model lists, stream clients for /test.
 *   - ./store: the shared ~/.wisp handle + OAuth managers (#63 — extracted so `wisp serve` shares them).
 *   - ./bridge: the TUI's Bridge host wiring (#63).
 *
 * Data shapes:
 *   - Mode: the screen state machine — 'input' (palette) | provider/key/model/effort pickers |
 *     'oauth-pick' (sign in/out target) | 'key-entry' (masked) | 'model-free' (typed model id) |
 *     'signin-wait' (browser flow pending) | 'test' (the /test wiring check streaming its reply) |
 *     'bridge' (listener info: address + secret) | the /routing chain (#65): 'routing' (map
 *     overview) → 'alias-name' / 'route-provider' → 'route-model-*' (pick or free text). Every
 *     non-input mode returns to 'input' on Esc, except the routing sub-screens, which step back
 *     to the map overview first.
 *   - RouteRow: which Routing-map row is being edited — a fixed Family or a named Alias.
 */

import { useRef, useState } from 'react';
import { useKeyboard, usePaste, useRenderer } from '@opentui/react';
import type { InputRenderable } from '@opentui/core';
import {
  PROVIDERS, SLASH_COMMANDS, parseSlash, suggestSlash, resolveBaseUrl, resolveKeyId, resolveModel,
  oauthModelOptions, getModelsDevCatalog, isCodexProvider, isAnthropicProvider,
  DEFAULT_EFFORT, isCodexSignedIn, isAnthropicSignedIn,
  resolveRoute, EMPTY_ROUTING_MAP, codexStream, anthropicStream, sseBlocks,
  chatCompletionTextDelta, standardEffortToCodex,
  FAMILY_KEYS, withFamilyRoute, withAlias, withoutAlias,
  type Provider, type EffortLevel, type RoutingMap, type FamilyKey, type Target,
} from '@wisp/core';
import { home, activeProvider, codexAuth, anthropicAuth } from './store';
import { createTuiBridge, ensureBridgeSecret, bridgeAddress, bridgePort } from './bridge';

// ----------------------------------------- Splash ----------------------------------------- //

// Hand-rolled ASCII art instead of <ascii-font>: deterministic across font packs, zero API risk.
const SPLASH = [
  '██╗    ██╗██╗███████╗██████╗ ',
  '██║    ██║██║██╔════╝██╔══██╗',
  '██║ █╗ ██║██║███████╗██████╔╝',
  '██║███╗██║██║╚════██║██╔═══╝ ',
  '╚███╔███╔╝██║███████║██║     ',
  ' ╚══╝╚══╝ ╚═╝╚══════╝╚═╝     ',
].join('\n');

const ACCENT = '#a78bfa';
const DIM = '#71717a';

// ----------------------------------------- Store ----------------------------------------- //

// The store handle + OAuth managers moved to store.ts with #63 (shared with `wisp serve`).

// Keyed rows only — the OAuth kinds sign in via /signin, they don't take keys.
const keyedProviders = (): Provider[] =>
  PROVIDERS.filter((p) => !isCodexProvider(p) && !isAnthropicProvider(p));

const oauthProviders = (): Provider[] =>
  PROVIDERS.filter((p) => isCodexProvider(p) || isAnthropicProvider(p));

// Sync signed-in read for display — the pure check over the stored bundle (skips codex's async
// CLI-import probe, so a never-used importable ~/.codex login reads signed out until first use).
const oauthStatus = (p: Provider): string =>
  isCodexProvider(p) ? (isCodexSignedIn(home.readAuth().codex) ? 'signed in' : 'signed out')
  : isAnthropicProvider(p) ? (isAnthropicSignedIn(home.readAuth().anthropic) ? 'signed in' : 'signed out')
  : '';

const saveKey = (p: Provider, key: string): void => {
  // Merge is shallow — spread the existing keys map or this write would drop sibling keys.
  // ponytail: read-then-write, not atomic — a cross-process merge-fn in WispHome if it ever bites.
  home.writeAuth({ keys: { ...home.readAuth().keys, [resolveKeyId(p)]: key } });
};

const saveModel = (p: Provider, model: string): void => {
  const cfg = home.readConfig();
  home.writeConfig({ models: { ...cfg.models, [p.id]: model } });
};

// ----------------------------------------- Sign-in + effort ----------------------------------------- //

// The full stored ladder. 'max' is Anthropic-only on the wire, but the send-time clamps
// (standardEffortToCodex, anthropicThinkingEffort) fold it, so offering it globally is safe.
const EFFORT_LADDER: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

// ----------------------------------------- Model lists ----------------------------------------- //

// A Provider's pickable models: curated list for the OAuth kinds, live GET <base>/models for keyed
// rows (same probe the extension uses). undefined = no list → the caller falls back to free text.
const fetchModelOptions = async (p: Provider): Promise<string[] | undefined> => {
  const catalog = await getModelsDevCatalog().catch(() => undefined);
  const curated = oauthModelOptions(p, catalog);
  if (curated) return curated;
  const base = resolveBaseUrl(p, home.readConfig().customBaseUrl ?? '');
  if (!base) return undefined;
  const key = home.readAuth().keys?.[resolveKeyId(p)] || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined);
  try {
    const res = await fetch(`${base}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id).sort();
    return ids.length ? ids : undefined;
  } catch { return undefined; }
};

// ----------------------------------------- /routing ----------------------------------------- //

// Which Routing-map row a picker chain is editing — a fixed Family or a named Alias (#65).
type RouteRow = { kind: 'family'; family: FamilyKey } | { kind: 'alias'; name: string };

const routingMap = (): RoutingMap => home.readConfig().routing ?? EMPTY_ROUTING_MAP;

const rowLabel = (row: RouteRow): string => (row.kind === 'family' ? row.family : row.name);

// Border-title-safe label: opentui silently drops a whole title over one non-ASCII char, and alias
// names are free text (the panel accepts anything) — replace the offenders, never lose the title.
const titleLabel = (row: RouteRow): string => rowLabel(row).replace(/[^\x20-\x7e]/g, '?');

const rowTarget = (map: RoutingMap, row: RouteRow): Target | undefined =>
  row.kind === 'family' ? map.families[row.family] : map.aliases.find((a) => a.name === row.name)?.target;

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

type Mode =
  | { kind: 'input' }
  | { kind: 'providers' }
  | { kind: 'key-pick' }
  | { kind: 'key-entry'; provider: Provider }
  | { kind: 'model-loading'; provider: Provider }
  | { kind: 'model-pick'; provider: Provider; options: string[] }
  | { kind: 'model-free'; provider: Provider }
  | { kind: 'oauth-pick'; action: 'signin' | 'signout' }
  | { kind: 'signin-wait'; provider: Provider }
  | { kind: 'effort-pick' }
  | { kind: 'test'; provider: Provider; model: string; text: string; phase: 'streaming' | 'done' | 'error'; error?: string }
  // Address + secret ride in the mode so the screen render stays pure (ensureBridgeSecret hits disk
  // and can write auth.json — a side effect that must not live in JSX).
  | { kind: 'bridge'; address: string; secret: string }
  // The /routing chain (#65): overview → name a new alias / pick a row's Provider → pick its model.
  | { kind: 'routing' }
  | { kind: 'alias-name' }
  | { kind: 'route-provider'; row: RouteRow }
  | { kind: 'route-model-loading'; row: RouteRow; provider: Provider }
  | { kind: 'route-model-pick'; row: RouteRow; provider: Provider; options: string[] }
  | { kind: 'route-model-free'; row: RouteRow; provider: Provider };

export const App = () => {
  const [mode, setMode] = useState<Mode>({ kind: 'input' });
  const [line, setLine] = useState('');       // live palette input, drives suggestions
  const [secret, setSecret] = useState('');   // key-entry buffer — rendered only as bullets
  const [status, setStatus] = useState('');
  const inputRef = useRef<InputRenderable>(null);
  const signinSeq = useRef(0); // bumped on cancel so a late OAuth resolve can't yank a later screen
  const testSeq = useRef(0);   // same guard for /test — a late delta/finish can't touch a later screen
  const testAbort = useRef<AbortController | null>(null);
  const bridgeStarting = useRef(false); // in-flight bind guard — see the /bridge case
  const renderer = useRenderer();

  // Bare process.exit skips opentui's teardown and strands the terminal in raw mode /
  // the alternate screen — destroy the renderer first, always.
  const exitTui = () => { renderer.destroy(); process.exit(0); };

  const backToInput = (message?: string) => {
    if (message) setStatus(message);
    setSecret('');
    setMode({ kind: 'input' });
  };

  // The /routing sub-screens step back HERE on Esc/apply, not to the palette — editing several
  // rows in a row is the normal flow.
  const backToRouting = (message?: string) => {
    if (message) setStatus(message);
    setMode({ kind: 'routing' });
  };

  // Persist one row's new Target through core's pure edits. A refusal (only reachable if a Provider
  // id slipped past the alias-name precheck) persists nothing.
  const applyRoute = (row: RouteRow, target: Target) => {
    const map = routingMap();
    const next = row.kind === 'family'
      ? withFamilyRoute(map, PROVIDERS, row.family, target)
      : withAlias(map, PROVIDERS, row.name, target);
    if (next) home.writeConfig({ routing: next });
    backToRouting(next ? `${rowLabel(row)} → ${target.providerId} (${target.model})` : 'Refused — that name is a Provider id.');
  };

  // The picker's last entry: clear a Family route / remove an Alias.
  const clearRow = (row: RouteRow) => {
    const map = routingMap();
    if (row.kind === 'family') {
      // Clearing can't be refused — withFamilyRoute only refuses a dangling Target.
      home.writeConfig({ routing: withFamilyRoute(map, PROVIDERS, row.family, undefined)! });
      backToRouting(`${row.family} route cleared.`);
    } else {
      home.writeConfig({ routing: withoutAlias(map, row.name) });
      backToRouting(`Alias ${row.name} removed.`);
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

  // opentui's JSX inherits React's DOM intrinsics, so onSubmit must also satisfy the DOM form
  // signature — take unknown and keep only the string opentui actually sends.
  const onSubmitText = (handle: (value: string) => void) => (value: unknown) => {
    if (typeof value === 'string') handle(value);
  };

  // Kick off the browser OAuth flow and park on the wait screen. The seq guard mirrors the model-fetch
  // race fix: Esc bumps it, so an abandoned flow resolving minutes later can't rewrite the UI.
  const startSignIn = (p: Provider) => {
    const seq = ++signinSeq.current;
    setMode({ kind: 'signin-wait', provider: p });
    const auth = isCodexProvider(p) ? codexAuth : anthropicAuth;
    auth.signIn().then(
      () => { if (seq === signinSeq.current) backToInput(`Signed in — ${p.label} is ready.`); },
      (err) => { if (seq === signinSeq.current) backToInput(`Sign-in failed: ${err instanceof Error ? err.message : String(err)}`); },
    );
  };

  // Sign-out is instant — core writes the {} tombstone (which also suppresses the ~/.codex re-import).
  const doSignOut = (p: Provider) => {
    (isCodexProvider(p) ? codexAuth : anthropicAuth).signOut();
    backToInput(`Signed out of ${p.label}.`);
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
    const unique = suggestSlash(`/${parsed.command}`);
    const command = SLASH_COMMANDS.some((c) => c.name === parsed.command)
      ? parsed.command
      : unique.length === 1 ? unique[0].name : parsed.command;
    const target = parsed;

    if (inputRef.current) inputRef.current.value = '';
    setLine('');

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
        // Match by kind, not id, so the arg names the door (codex/anthropic) rather than a catalog row.
        const p = arg
          ? oauthProviders().find((x) => (arg === 'codex' && isCodexProvider(x)) || (arg === 'anthropic' && isAnthropicProvider(x)))
          : undefined;
        if (arg && !p) { setStatus(`/${command} takes codex or anthropic — got: ${target.args[0]}`); return; }
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
      case 'quit': exitTui(); return;
      default: setStatus(`Unknown command: /${command}`);
    }
  };

  // ----- global keys: Esc backs out of any screen (exits from the palette); key-entry is hand-read
  // here because <input> has no masked variant — chars land in `secret`, never on screen. -----
  useKeyboard((key) => {
    if (key.name === 'escape') {
      // ponytail: Esc detaches the UI only — the loopback waits out its own 5-min timeout, and a flow
      // the user still finishes in the browser lands tokens anyway; add a signIn cancel handle if it bites.
      if (mode.kind === 'signin-wait') signinSeq.current++; // invalidate the pending flow's UI claim
      if (mode.kind === 'test') { testSeq.current++; testAbort.current?.abort(); } // kill the request too
      // Routing sub-screens back out one level (to the map), not all the way to the palette.
      const routingSub = mode.kind === 'alias-name' || mode.kind === 'route-provider'
        || mode.kind === 'route-model-loading' || mode.kind === 'route-model-pick' || mode.kind === 'route-model-free';
      mode.kind === 'input' ? exitTui()
        : routingSub ? backToRouting('Cancelled.')
        : mode.kind === 'test' && mode.phase !== 'streaming' ? backToInput() // finished screen just closes
        : mode.kind === 'bridge' ? backToInput() // closes the info screen only — the listener stays up
        : backToInput('Cancelled.');
      return;
    }
    if (mode.kind !== 'key-entry') return;
    if (key.name === 'return' || key.name === 'enter') {
      const value = secret.trim();
      if (!value) { backToInput('Empty — key unchanged.'); return; }
      saveKey(mode.provider, value);
      backToInput(`Key saved for ${mode.provider.label}.`);
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

  return (
    <box flexDirection="column" padding={1}>
      <text fg={ACCENT}>{SPLASH}</text>
      <text fg={DIM}>BYOK model router</text>

      {mode.kind === 'input' && (
        <>
          <box border title="wisp" marginTop={1}>
            <input ref={inputRef} placeholder="Type / for commands" focused onInput={setLine} onSubmit={onSubmitText(runCommand)} />
          </box>
          {suggestions.map((c) => (
            <text key={c.name}>
              {'  '}<span fg={ACCENT}>/{c.name}</span>{c.args ? ` ${c.args}` : ''} <span fg={DIM}>— {c.description}</span>
            </text>
          ))}
        </>
      )}

      {mode.kind === 'providers' && (
        <box border title="Active Provider" marginTop={1} flexDirection="column">
          {/* select collapses to zero rows without an explicit height; an option is 2 rows with description */}
          <select
            focused
            height={Math.min(PROVIDERS.length * 2, 16)}
            showScrollIndicator
            options={PROVIDERS.map((p) => {
              const auth = oauthStatus(p);
              return {
                name: p.id === activeProvider().id ? `${p.label} (active)` : p.label,
                description: auth ? `${p.id} — ${auth}` : p.id,
                value: p.id,
              };
            })}
            onSelect={(_i, opt) => {
              if (!opt) return;
              home.writeConfig({ provider: opt.value as string });
              backToInput(`Active Provider → ${String(opt.name).replace(' (active)', '')}`);
            }}
          />
        </box>
      )}

      {mode.kind === 'key-pick' && (
        <box border title="Set key for…" marginTop={1} flexDirection="column">
          <select
            focused
            height={Math.min(keyedProviders().length * 2, 16)}
            showScrollIndicator
            options={keyedProviders().map((p) => ({ name: p.label, description: p.id, value: p.id }))}
            onSelect={(_i, opt) => {
              const p = PROVIDERS.find((x) => x.id === opt?.value);
              if (p) setMode({ kind: 'key-entry', provider: p });
            }}
          />
        </box>
      )}

      {mode.kind === 'key-entry' && (
        <box border title={`API key — ${mode.provider.label}`} marginTop={1}>
          <text>{secret ? '•'.repeat(secret.length) : ''}<span fg={DIM}>{secret ? '' : 'Paste or type, Enter to save, Esc to cancel'}</span></text>
        </box>
      )}

      {mode.kind === 'model-loading' && (
        <text fg={DIM} marginTop={1}>Fetching models for {mode.provider.label}…</text>
      )}

      {mode.kind === 'model-pick' && (
        <box border title={`Model — ${mode.provider.label}`} marginTop={1} flexDirection="column">
          {/* descriptions are empty here — hide them so each model is one row */}
          <select
            focused
            height={Math.min(mode.options.length, 14)}
            showDescription={false}
            showScrollIndicator
            options={mode.options.map((id) => ({
              name: id === resolveModel(home.readConfig().models ?? {}, mode.provider) ? `${id} (current)` : id,
              description: '',
              value: id,
            }))}
            onSelect={(_i, opt) => {
              if (!opt) return;
              saveModel(mode.provider, opt.value as string);
              backToInput(`${mode.provider.label} model → ${opt.value}`);
            }}
          />
        </box>
      )}

      {mode.kind === 'model-free' && (
        <box border title={`Model — ${mode.provider.label} (no live list — type an id)`} marginTop={1}>
          <input
            focused
            placeholder={mode.provider.defaultModel || 'model id'}
            onSubmit={onSubmitText((value) => {
              const id = value.trim();
              if (id) { saveModel(mode.provider, id); backToInput(`${mode.provider.label} model → ${id}`); }
              else backToInput('Empty — model unchanged.');
            })}
          />
        </box>
      )}

      {mode.kind === 'oauth-pick' && (
        <box border title={mode.action === 'signin' ? 'Sign in to…' : 'Sign out of…'} marginTop={1} flexDirection="column">
          <select
            focused
            height={Math.min(oauthProviders().length * 2, 16)}
            showScrollIndicator
            options={oauthProviders().map((p) => ({ name: p.label, description: p.id, value: p.id }))}
            onSelect={(_i, opt) => {
              const p = oauthProviders().find((x) => x.id === opt?.value);
              if (!p) return;
              mode.action === 'signin' ? startSignIn(p) : doSignOut(p);
            }}
          />
        </box>
      )}

      {mode.kind === 'signin-wait' && (
        <text fg={DIM} marginTop={1}>Browser opened — finish the {mode.provider.label} sign-in there. Esc to cancel.</text>
      )}

      {mode.kind === 'test' && (
        // plain-ASCII title on purpose — opentui border titles drop non-ASCII (em-dash/·), see gotchas
        <box border title={`/test: ${mode.provider.label} (${mode.model})`} marginTop={1} flexDirection="column">
          {/* raw reply text, streamed as-is — deliberately no markdown, no history (#62) */}
          {mode.text !== '' && <text>{mode.text}</text>}
          {mode.phase === 'streaming' && <text fg={DIM}>{mode.text === '' ? 'Waiting for the first token… ' : ''}Esc to cancel.</text>}
          {mode.phase === 'done' && <text fg={DIM}>Done — Esc to close.</text>}
          {mode.phase === 'error' && <text fg="#f87171">{mode.error}</text>}
        </box>
      )}

      {mode.kind === 'bridge' && (
        <box border title="Bridge" marginTop={1} flexDirection="column">
          <text>OpenAI door:    <span fg={ACCENT}>{mode.address}/v1</span></text>
          <text>Anthropic door: <span fg={ACCENT}>{mode.address}</span></text>
          <text>Access secret:  <span fg={ACCENT}>{mode.secret}</span></text>
          <text fg={DIM}>Esc closes this screen — the listener stays up. /bridge again to stop; /quit kills it (headless: wisp serve).</text>
        </box>
      )}

      {mode.kind === 'routing' && (
        <box border title="Routing map" marginTop={1} flexDirection="column">
          {/* value encodes the row as kind:key — split at the FIRST colon, alias names may contain more */}
          <select
            focused
            height={Math.min((FAMILY_KEYS.length + routingMap().aliases.length + 1) * 2, 16)}
            showScrollIndicator
            options={[
              ...FAMILY_KEYS.map((f) => {
                const t = routingMap().families[f];
                return { name: f, description: t ? `${t.providerId} (${t.model})` : 'not routed — Active Provider answers', value: `family:${f}` };
              }),
              ...routingMap().aliases.map((a) => ({ name: a.name, description: `alias — ${a.target.providerId} (${a.target.model})`, value: `alias:${a.name}` })),
              { name: 'Add alias', description: 'name a new bridged model', value: 'add' },
            ]}
            onSelect={(_i, opt) => {
              if (!opt) return;
              const v = String(opt.value);
              if (v === 'add') { setMode({ kind: 'alias-name' }); return; }
              const key = v.slice(v.indexOf(':') + 1);
              setMode({
                kind: 'route-provider',
                row: v.startsWith('family:') ? { kind: 'family', family: key as FamilyKey } : { kind: 'alias', name: key },
              });
            }}
          />
        </box>
      )}

      {mode.kind === 'alias-name' && (
        <box border title="New alias name" marginTop={1}>
          <input
            focused
            placeholder="a bridged model name, e.g. fast"
            onSubmit={onSubmitText((value) => {
              const name = value.trim();
              if (!name) { backToRouting('Empty — no alias added.'); return; }
              // Precheck the shadow rule here so the collision message lands while the name is
              // still editable (core's withAlias refuses it again at persist time).
              if (PROVIDERS.some((p) => p.id === name)) { setStatus(`"${name}" is a Provider id — pick another name.`); return; }
              setMode({ kind: 'route-provider', row: { kind: 'alias', name } });
            })}
          />
        </box>
      )}

      {mode.kind === 'route-provider' && (
        <box border title={`Route ${titleLabel(mode.row)} via...`} marginTop={1} flexDirection="column">
          <select
            focused
            height={Math.min((PROVIDERS.length + 1) * 2, 16)}
            showScrollIndicator
            options={[
              ...PROVIDERS.map((p) => ({ name: p.label, description: p.id, value: p.id })),
              mode.row.kind === 'family'
                ? { name: 'Clear route', description: 'family falls back to the Active Provider', value: ' clear' }
                : { name: 'Remove alias', description: 'delete this bridged name', value: ' clear' },
            ]}
            onSelect={(_i, opt) => {
              if (!opt) return;
              if (opt.value === ' clear') { clearRow(mode.row); return; }
              const p = PROVIDERS.find((x) => x.id === opt.value);
              if (p) startRouteModel(mode.row, p);
            }}
          />
        </box>
      )}

      {mode.kind === 'route-model-loading' && (
        <text fg={DIM} marginTop={1}>Fetching models for {mode.provider.label}…</text>
      )}

      {mode.kind === 'route-model-pick' && (
        <box border title={`Model for ${titleLabel(mode.row)} - ${mode.provider.label}`} marginTop={1} flexDirection="column">
          {/* "(current)" only when the row already targets THIS provider — two providers can list the same id */}
          <select
            focused
            height={Math.min(mode.options.length, 14)}
            showDescription={false}
            showScrollIndicator
            options={mode.options.map((id) => {
              const t = rowTarget(routingMap(), mode.row);
              return {
                name: t?.providerId === mode.provider.id && t.model === id ? `${id} (current)` : id,
                description: '',
                value: id,
              };
            })}
            onSelect={(_i, opt) => {
              if (opt) applyRoute(mode.row, { providerId: mode.provider.id, model: String(opt.value) });
            }}
          />
        </box>
      )}

      {mode.kind === 'route-model-free' && (
        <box border title={`Model for ${titleLabel(mode.row)} - ${mode.provider.label} (no live list - type an id)`} marginTop={1}>
          <input
            focused
            placeholder={mode.provider.defaultModel || 'model id'}
            onSubmit={onSubmitText((value) => {
              const id = value.trim();
              if (id) applyRoute(mode.row, { providerId: mode.provider.id, model: id });
              else backToRouting('Empty — route unchanged.');
            })}
          />
        </box>
      )}

      {mode.kind === 'effort-pick' && (
        <box border title="Reasoning Effort (Codex + Anthropic)" marginTop={1} flexDirection="column">
          <select
            focused
            height={Math.min(EFFORT_LADDER.length * 2, 16)}
            showScrollIndicator
            options={EFFORT_LADDER.map((e) => ({
              name: e === (home.readConfig().effort ?? DEFAULT_EFFORT) ? `${e} (current)` : e,
              description: e === 'max' ? 'Anthropic only — folds to xhigh on Codex' : '',
              value: e,
            }))}
            onSelect={(_i, opt) => {
              if (!opt) return;
              home.writeConfig({ effort: opt.value as EffortLevel });
              backToInput(`Effort → ${opt.value}`);
            }}
          />
        </box>
      )}

      {status !== '' && <text fg={DIM} marginTop={1}>{status}</text>}
    </box>
  );
};
