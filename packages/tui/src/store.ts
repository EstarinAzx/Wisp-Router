// ---------------- store.ts — shared ~/.wisp handle + OAuth managers for both TUI faces ---------------- //

/*
 * Depends on:
 *   - @wisp/core: WispHome (~/.wisp store), PROVIDERS catalog, CodexAuth/AnthropicAuth (browser OAuth).
 *   - node child_process: spawn the platform's open-browser command for the OAuth flows.
 *
 * Data shapes: none of its own.
 *
 * Extracted from app.tsx with #63 so the headless `wisp serve` path shares the exact same store and
 * auth-manager instances without importing the opentui-rendering app module.
 */

import { spawn } from 'child_process';
import { PROVIDERS, WispHome, CodexAuth, AnthropicAuth, XaiAuth, KimiAuth, AntigravityAuth, isKimiProvider, resolveKeyId, type Provider, type QuotaProvider } from '@wisp/core';

// ----------------------------- Store ----------------------------- //

// One handle for the whole session — every command reads fresh and writes through it (ADR-0002).
export const home = new WispHome();

export const activeProvider = (): Provider =>
  PROVIDERS.find((p) => p.id === home.readConfig().provider) ?? PROVIDERS[0];

// ----------------------------- OAuth managers ----------------------------- //

// Open the system browser from a terminal process. win32 goes through rundll32's URL handler —
// cmd.exe's `start` would need &-escaping inside the OAuth query string; rundll32 takes the URL verbatim.
// A failed spawn REJECTS so signIn fails fast with a real message instead of the user waiting out the
// 5-minute OAuth timeout on a browser that never opened.
export const openExternal = (url: string): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const [cmd, ...args] =
      process.platform === 'win32' ? ['rundll32', 'url.dll,FileProtocolHandler', url]
      : process.platform === 'darwin' ? ['open', url]
      : ['xdg-open', url];
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', (e) => reject(new Error(`Could not open the browser: ${e.message}`)));
    child.on('spawn', () => { child.unref(); resolve(true); });
  });

// Same auth.json slices the extension wires — log is dropped (no output channel in a raw-mode TUI;
// sign-in failures surface on the wait screen instead).
export const codexAuth = new CodexAuth(
  { read: () => home.readAuth().codex, write: (c) => { home.writeAuth({ codex: c }); } },
  openExternal, () => {});
export const anthropicAuth = new AnthropicAuth(
  { read: () => home.readAuth().anthropic, write: (c) => { home.writeAuth({ anthropic: c }); } },
  openExternal, () => {});

// Quota is explicitly tied to Wisp sign-in; even a concurrent auth-file removal must not import native login.
export const quotaCurrent = async (provider: QuotaProvider): Promise<{ accessToken: string; accountId?: string } | undefined> => {
  const creds = provider === 'codex' ? await codexAuth.current({ importNative: false }) : await anthropicAuth.current();
  return creds?.accessToken ? { accessToken: creds.accessToken,
    ...(provider === 'codex' ? { accountId: (creds as { accountId?: string }).accountId } : {}) } : undefined;
};
export const xaiAuth = new XaiAuth(
  { read: () => home.readAuth().xai, write: (c) => { home.writeAuth({ xai: c }); } },
  openExternal, () => {});
// Kimi takes no openExternal: the device flow shows the user a URL + code to visit themselves (#170), so
// there is no browser leg to launch and nothing to catch on a loopback.
export const kimiAuth = new KimiAuth(
  { read: () => home.readAuth().kimi, write: (c) => { home.writeAuth({ kimi: c }); } },
  () => {});
// Antigravity (#188) is a browser flow like the first three — Google OAuth on a fixed loopback port.
export const antigravityAuth = new AntigravityAuth(
  { read: () => home.readAuth().antigravity, write: (c) => { home.writeAuth({ antigravity: c }); } },
  openExternal, () => {});

// ----------------------------- Bearer resolution ----------------------------- //

// The ONE rule for "what do we send as this Provider's bearer" — every request path in this face goes
// through it (the Bridge's keyFor, the /models probe, the /test wiring check). Kimi (#170) is the reason it
// exists as a shared function: its credential is an OAuth access token rather than a keys-map entry, and
// resolving that in only some of the paths is how a signed-in user gets a silent 401 from the others.
export const bearerFor = async (p: Provider): Promise<string> => {
  if (isKimiProvider(p)) return kimiAuth.bearer();
  const stored = home.readAuth().keys?.[resolveKeyId(p)];
  return stored?.trim() || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : '') || '';
};
