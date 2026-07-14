// ---------------- app.tsx — the Wisp TUI: splash, slash palette, and the three MVP commands ---------------- //

/*
 * Depends on:
 *   - @opentui/react: JSX intrinsics (box/text/input/select) + useKeyboard/usePaste hooks.
 *   - @opentui/core: InputRenderable — ref type for clearing the palette input after a command.
 *   - @wisp/core: PROVIDERS catalog + resolvers, WispHome (~/.wisp store), slash parse/suggest,
 *     oauthModelOptions + getModelsDevCatalog for the OAuth model lists.
 *
 * Data shapes:
 *   - Mode: the screen state machine — 'input' (palette) | provider/key/model pickers | 'key-entry'
 *     (masked) | 'model-free' (typed model id). Every non-input mode returns to 'input' on Esc.
 */

import { useRef, useState } from 'react';
import { useKeyboard, usePaste, useRenderer } from '@opentui/react';
import type { InputRenderable } from '@opentui/core';
import {
  PROVIDERS, SLASH_COMMANDS, parseSlash, suggestSlash, resolveBaseUrl, resolveKeyId, resolveModel,
  oauthModelOptions, getModelsDevCatalog, isCodexProvider, isAnthropicProvider,
  WispHome, type Provider,
} from '@wisp/core';

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

// One handle for the whole session — every command reads fresh and writes through it (ADR-0002).
const home = new WispHome();

const activeProvider = (): Provider =>
  PROVIDERS.find((p) => p.id === home.readConfig().provider) ?? PROVIDERS[0];

// Keyed rows only — the OAuth kinds sign in, they don't take keys (/signin is a later slice).
const keyedProviders = (): Provider[] =>
  PROVIDERS.filter((p) => !isCodexProvider(p) && !isAnthropicProvider(p));

const saveKey = (p: Provider, key: string): void => {
  // Merge is shallow — spread the existing keys map or this write would drop sibling keys.
  // ponytail: read-then-write, not atomic — a cross-process merge-fn in WispHome if it ever bites.
  home.writeAuth({ keys: { ...home.readAuth().keys, [resolveKeyId(p)]: key } });
};

const saveModel = (p: Provider, model: string): void => {
  const cfg = home.readConfig();
  home.writeConfig({ models: { ...cfg.models, [p.id]: model } });
};

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

// ----------------------------------------- App ----------------------------------------- //

type Mode =
  | { kind: 'input' }
  | { kind: 'providers' }
  | { kind: 'key-pick' }
  | { kind: 'key-entry'; provider: Provider }
  | { kind: 'model-loading'; provider: Provider }
  | { kind: 'model-pick'; provider: Provider; options: string[] }
  | { kind: 'model-free'; provider: Provider };

export const App = () => {
  const [mode, setMode] = useState<Mode>({ kind: 'input' });
  const [line, setLine] = useState('');       // live palette input, drives suggestions
  const [secret, setSecret] = useState('');   // key-entry buffer — rendered only as bullets
  const [status, setStatus] = useState('');
  const inputRef = useRef<InputRenderable>(null);
  const renderer = useRenderer();

  // Bare process.exit skips opentui's teardown and strands the terminal in raw mode /
  // the alternate screen — destroy the renderer first, always.
  const exitTui = () => { renderer.destroy(); process.exit(0); };

  const backToInput = (message?: string) => {
    if (message) setStatus(message);
    setSecret('');
    setMode({ kind: 'input' });
  };

  // opentui's JSX inherits React's DOM intrinsics, so onSubmit must also satisfy the DOM form
  // signature — take unknown and keep only the string opentui actually sends.
  const onSubmitText = (handle: (value: string) => void) => (value: unknown) => {
    if (typeof value === 'string') handle(value);
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
      case 'key': {
        const p = target.args[0] ? byId(target.args[0]) : undefined;
        if (target.args[0] && !p) { setStatus(`Unknown provider: ${target.args[0]}`); return; }
        // OAuth rows sign in, they don't take keys — same filter the picker applies.
        if (p && (isCodexProvider(p) || isAnthropicProvider(p))) {
          setStatus(`${p.label} uses OAuth sign-in, not an API key.`); return;
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
      case 'quit': exitTui(); return;
      default: setStatus(`Unknown command: /${command}`);
    }
  };

  // ----- global keys: Esc backs out of any screen (exits from the palette); key-entry is hand-read
  // here because <input> has no masked variant — chars land in `secret`, never on screen. -----
  useKeyboard((key) => {
    if (key.name === 'escape') { mode.kind === 'input' ? exitTui() : backToInput('Cancelled.'); return; }
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
            options={PROVIDERS.map((p) => ({
              name: p.id === activeProvider().id ? `${p.label} (active)` : p.label,
              description: p.id,
              value: p.id,
            }))}
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

      {status !== '' && <text fg={DIM} marginTop={1}>{status}</text>}
    </box>
  );
};
