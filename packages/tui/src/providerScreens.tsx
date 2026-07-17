// ---------------- providerScreens.tsx — the provider-management flow: list, menu, keys, models, OAuth, effort ---------------- //

/*
 * Depends on:
 *   - @wisp/core: PROVIDERS catalog + resolvers, OAuth kind/signed-in checks.
 *   - ./modelFetch: fetchModelOptions re-export — the fetch itself moved out with #123.
 *   - ./store: the shared ~/.wisp handle + Active-Provider read — key/model storage and the
 *     at-a-glance row statuses.
 *   - ./theme: PANEL/DIM/SELECT_COLORS — the shared look.
 *   - ./widgets: onSubmitText — the DOM-signature submit adapter.
 *
 * Data shapes:
 *   - Screens are pure functions of their Mode payload fields + navigation callbacks (payload
 *     types live in ./modes). No Screen owns navigation or shell state — the shell keeps the
 *     Mode machine, the action starters (sign-in race guard, model fetch), and all keyboard
 *     handling; masked key entry arrives here as the `secret` prop, already hand-read.
 *
 * Extracted from app.tsx with #117: the ten provider-flow Screens plus the key/model storage
 * helpers only this flow uses. The shell imports what its action starters need
 * (EFFORT_LADDER, fetchModelOptions, oauthProviders, saveKey).
 */

import {
  PROVIDERS, resolveKeyId, resolveModel,
  isCodexProvider, isAnthropicProvider, isXaiProvider, isCodexSignedIn, isAnthropicSignedIn,
  isXaiSignedIn, DEFAULT_EFFORT,
  type Provider, type EffortLevel,
} from '@wisp/core';
import { home, activeProvider } from './store';
import { PANEL, DIM, SELECT_COLORS } from './theme';
import { onSubmitText, SELECT_MOUSE } from './widgets';

// ----------------------------------------- Key + model storage ----------------------------------------- //

// The three OAuth kinds sign in via a browser flow — every other row takes an API key.
const isOAuthProvider = (p: Provider): boolean =>
  isCodexProvider(p) || isAnthropicProvider(p) || isXaiProvider(p);

// Keyed rows only — the OAuth kinds sign in via /signin, they don't take keys.
const keyedProviders = (): Provider[] => PROVIDERS.filter((p) => !isOAuthProvider(p));

export const oauthProviders = (): Provider[] => PROVIDERS.filter(isOAuthProvider);

// Sync signed-in read for display — the pure check over the stored bundle (skips codex's async
// CLI-import probe, so a never-used importable ~/.codex login reads signed out until first use).
const oauthStatus = (p: Provider): string =>
  isCodexProvider(p) ? (isCodexSignedIn(home.readAuth().codex) ? 'signed in' : 'signed out')
  : isAnthropicProvider(p) ? (isAnthropicSignedIn(home.readAuth().anthropic) ? 'signed in' : 'signed out')
  : isXaiProvider(p) ? (isXaiSignedIn(home.readAuth().xai) ? 'signed in' : 'signed out')
  : '';

export const saveKey = (p: Provider, key: string): void => {
  // Merge is shallow — spread the existing keys map or this write would drop sibling keys.
  // ponytail: read-then-write, not atomic — a cross-process merge-fn in WispHome if it ever bites.
  home.writeAuth({ keys: { ...home.readAuth().keys, [resolveKeyId(p)]: key } });
};

// The row's key as stored in auth.json — env fallbacks deliberately excluded: this feeds the
// menu's Remove row, and only a stored key can be removed (#106).
const storedKey = (p: Provider): string | undefined => home.readAuth().keys?.[resolveKeyId(p)];

// List-row key status, mirroring oauthStatus: stored beats env (a stored key is what actually
// gets sent when both exist); '' keeps unconfigured rows clean.
const keyStatus = (p: Provider): string =>
  storedKey(p) ? 'key set' : p.apiKeyEnv && process.env[p.apiKeyEnv] ? 'env key' : '';

const removeKey = (p: Provider): void => {
  const keys = { ...home.readAuth().keys };
  delete keys[resolveKeyId(p)];
  home.writeAuth({ keys });
};

// One provider's submenu rows (#106): set-active first (so setting active stays Enter-Enter),
// then the kind's credential actions. Remove only appears when a stored key exists — the menu
// never offers a no-op (env-var keys aren't stored, so they can't be removed here).
const menuRows = (p: Provider): Array<{ name: string; description: string; value: string }> => [
  { name: 'Use as Active Provider', description: p.id === activeProvider().id ? 'already active' : p.id, value: 'active' },
  ...(isOAuthProvider(p)
    ? [
        { name: 'Sign in', description: `browser flow — ${oauthStatus(p)}`, value: 'signin' },
        { name: 'Sign out', description: 'clear the stored tokens', value: 'signout' },
      ]
    : [
        { name: 'Set API key', description: 'masked entry', value: 'set-key' },
        ...(storedKey(p) ? [{ name: 'Remove key', description: 'delete the stored key', value: 'remove-key' }] : []),
      ]),
];

const saveModel = (p: Provider, model: string): void => {
  const cfg = home.readConfig();
  home.writeConfig({ models: { ...cfg.models, [p.id]: model } });
};

// ----------------------------------------- Effort ladder ----------------------------------------- //

// The full stored ladder. 'max' is Anthropic-only on the wire, but the send-time clamps
// (standardEffortToCodex, anthropicThinkingEffort) fold it, so offering it globally is safe.
export const EFFORT_LADDER: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

// ----------------------------------------- Model lists ----------------------------------------- //

// Moved to modelFetch.ts with #123 (headless `wisp models` needs the fetch renderer-free);
// re-exported so the shell's import path keeps working.
export { fetchModelOptions } from './modelFetch';

// ----------------------------------------- Screens ----------------------------------------- //

// The Provider list — Enter opens the row's action menu (#106).
export const ProvidersScreen = ({ onPick }: { onPick: (p: Provider) => void }) => (
  <box {...PANEL} title="Providers" marginTop={1} flexDirection="column">
    {/* select collapses to zero rows without an explicit height; an option is 2 rows with description */}
    {/* the built-in ▶ indicator is off on every select — the glyph is ambiguous-width (double-wide
        on common Windows fonts, smearing into the label); the highlight bar already marks the row */}
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(PROVIDERS.length * 2, 16)}
      showSelectionIndicator={false}
      showScrollIndicator
      options={PROVIDERS.map((p) => {
        // keyed rows get the same at-a-glance status the OAuth rows always had (#106)
        const auth = oauthStatus(p) || keyStatus(p);
        return {
          name: p.id === activeProvider().id ? `${p.label} (active)` : p.label,
          description: auth ? `${p.id} — ${auth}` : p.id,
          value: p.id,
        };
      })}
      onSelect={(_i, opt) => {
        // Enter opens the row's action menu (#106) — set-active moved to its first row.
        const p = PROVIDERS.find((x) => x.id === opt?.value);
        if (p) onPick(p);
      }}
    />
  </box>
);

// One Provider's action menu (#106). Storage actions apply here; sign-in/out are shell
// starters (race guard, browser flow), so they arrive as callbacks.
export const ProviderMenuScreen = ({ provider, onDone, onSetKey, onSignIn, onSignOut }: {
  provider: Provider;
  onDone: (message?: string) => void;
  onSetKey: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) => (
  <box {...PANEL} title={provider.label} marginTop={1} flexDirection="column">
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(menuRows(provider).length * 2, 16)}
      showSelectionIndicator={false}
      showScrollIndicator
      options={menuRows(provider)}
      onSelect={(_i, opt) => {
        switch (opt?.value) {
          case 'active':
            home.writeConfig({ provider: provider.id });
            // Post-selection nudge (#81): teach the clean-list path at the moment it matters.
            onDone(`Active Provider → ${provider.label} — tip: name it in /routing for a clean /model list.`);
            return;
          case 'set-key': onSetKey(); return;
          case 'remove-key': removeKey(provider); onDone(`Stored key removed for ${provider.label}.`); return;
          case 'signin': onSignIn(); return;
          case 'signout': onSignOut(); return;
        }
      }}
    />
  </box>
);

// /key with no argument — pick which keyed row gets the masked entry.
export const KeyPickScreen = ({ onPick }: { onPick: (p: Provider) => void }) => (
  <box {...PANEL} title="Set key for…" marginTop={1} flexDirection="column">
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(keyedProviders().length * 2, 16)}
      showSelectionIndicator={false}
      showScrollIndicator
      options={keyedProviders().map((p) => ({ name: p.label, description: p.id, value: p.id }))}
      onSelect={(_i, opt) => {
        const p = PROVIDERS.find((x) => x.id === opt?.value);
        if (p) onPick(p);
      }}
    />
  </box>
);

// Masked key entry — the shell's global keyboard handler feeds `secret`; only bullets render.
export const KeyEntryScreen = ({ provider, secret }: { provider: Provider; secret: string }) => (
  <box {...PANEL} title={`API key — ${provider.label}`} marginTop={1}>
    <text wrapMode="none">{secret ? '•'.repeat(secret.length) : ''}<span fg={DIM}>{secret ? '' : 'Paste or type, Enter to save, Esc to cancel'}</span></text>
  </box>
);

// The /model fetch's parking line — the shell starter resolves it to pick or free entry.
export const ModelLoadingScreen = ({ provider }: { provider: Provider }) => (
  <text wrapMode="none" flexShrink={0} fg={DIM} marginTop={1}>Fetching models for {provider.label}…</text>
);

// Pick the Provider's remembered model from its curated/live list.
export const ModelPickScreen = ({ provider, options, onDone }: {
  provider: Provider;
  options: string[];
  onDone: (message?: string) => void;
}) => (
  <box {...PANEL} title={`Model — ${provider.label}`} marginTop={1} flexDirection="column">
    {/* descriptions are empty here — hide them so each model is one row */}
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(options.length, 14)}
      showDescription={false}
      showSelectionIndicator={false}
      showScrollIndicator
      options={options.map((id) => ({
        name: id === resolveModel(home.readConfig().models ?? {}, provider) ? `${id} (current)` : id,
        description: '',
        value: id,
      }))}
      onSelect={(_i, opt) => {
        if (!opt) return;
        saveModel(provider, opt.value as string);
        onDone(`${provider.label} model → ${opt.value}`);
      }}
    />
  </box>
);

// No live list — free-typed model id; empty keeps the old one.
export const ModelFreeScreen = ({ provider, onDone }: {
  provider: Provider;
  onDone: (message?: string) => void;
}) => (
  <box {...PANEL} title={`Model — ${provider.label} (no live list — type an id)`} marginTop={1}>
    <input
      focused
      placeholder={provider.defaultModel || 'model id'}
      onSubmit={onSubmitText((value) => {
        const id = value.trim();
        if (id) { saveModel(provider, id); onDone(`${provider.label} model → ${id}`); }
        else onDone('Empty — model unchanged.');
      })}
    />
  </box>
);

// /signin | /signout with no argument — pick which OAuth door.
export const OauthPickScreen = ({ action, onSignIn, onSignOut }: {
  action: 'signin' | 'signout';
  onSignIn: (p: Provider) => void;
  onSignOut: (p: Provider) => void;
}) => (
  <box {...PANEL} title={action === 'signin' ? 'Sign in to…' : 'Sign out of…'} marginTop={1} flexDirection="column">
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(oauthProviders().length * 2, 16)}
      showSelectionIndicator={false}
      showScrollIndicator
      options={oauthProviders().map((p) => ({ name: p.label, description: p.id, value: p.id }))}
      onSelect={(_i, opt) => {
        const p = oauthProviders().find((x) => x.id === opt?.value);
        if (!p) return;
        action === 'signin' ? onSignIn(p) : onSignOut(p);
      }}
    />
  </box>
);

// The browser-flow wait line — Esc routing (cancel, menu-origin return) lives in the shell.
export const SigninWaitScreen = ({ provider }: { provider: Provider }) => (
  <text wrapMode="none" flexShrink={0} fg={DIM} marginTop={1}>Browser opened — finish the {provider.label} sign-in there. Esc to cancel.</text>
);

// Pick the stored reasoning effort — writes config here; navigation stays a callback.
export const EffortPickScreen = ({ onDone }: { onDone: (message?: string) => void }) => (
  <box {...PANEL} title="Reasoning Effort (Codex + Anthropic)" marginTop={1} flexDirection="column">
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(EFFORT_LADDER.length * 2, 16)}
      showSelectionIndicator={false}
      showScrollIndicator
      options={EFFORT_LADDER.map((e) => ({
        name: e === (home.readConfig().effort ?? DEFAULT_EFFORT) ? `${e} (current)` : e,
        description: e === 'max' ? 'Anthropic only — folds to xhigh on Codex' : '',
        value: e,
      }))}
      onSelect={(_i, opt) => {
        if (!opt) return;
        home.writeConfig({ effort: opt.value as EffortLevel });
        onDone(`Effort → ${opt.value}`);
      }}
    />
  </box>
);
