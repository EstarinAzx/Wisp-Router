// ---------------- bridge.ts — the TUI's Bridge host: engine wiring over the ~/.wisp store ---------------- //

/*
 * Depends on:
 *   - crypto (node stdlib): generate the access secret when none is stored yet.
 *   - openai: the per-Provider client the engine's keyed path streams through.
 *   - @wisp/core: createBridgeServer (the engine) + DEFAULT_BRIDGE_PORT, catalog resolvers,
 *     the empty routing map, the effort default.
 *   - ./store: the shared ~/.wisp handle + OAuth managers (#63).
 *   - ./bridgeLog: file logging shared by the TUI and headless hosts.
 *
 * Data shapes: none of its own — BridgeDeps comes from core.
 *
 * The extension wires the SAME engine over the SAME store (extension.ts createBridgeServer call);
 * this is the terminal face's twin of that wiring. Both faces share port + secret, so only one can
 * listen at a time — the second start fails loud (EADDRINUSE), by design.
 */

import { randomBytes } from 'crypto';
import OpenAI from 'openai';
import {
  PROVIDERS, createBridgeServer, DEFAULT_BRIDGE_PORT, resolveBaseUrl, resolveKeyId,
  EMPTY_ROUTING_MAP, DEFAULT_EFFORT, effectiveAliasOnly, type Provider,
} from '@wisp/core';
import { home, activeProvider, codexAuth, anthropicAuth, xaiAuth, kimiAuth, antigravityAuth, bearerFor } from './store';
import { appendBridgeLog, rotateBridgeLog } from './bridgeLog';

// ----------------------------- Secret + address ----------------------------- //

// Read-or-create the shared access secret. auth.json's bridgeSecret is the SAME slot the extension
// uses, so a client wired against one face keeps working when the other face hosts. Trimmed like the
// extension's read — authOk compares exactly, so an untrimmed read here would 401 what the other face accepts.
export const ensureBridgeSecret = (): string => {
  const existing = home.readAuth().bridgeSecret?.trim();
  if (existing) return existing;
  const generated = randomBytes(32).toString('base64url');
  home.writeAuth({ bridgeSecret: generated });
  return generated;
};

export const bridgePort = (): number => home.readConfig().bridge?.port ?? DEFAULT_BRIDGE_PORT;
export const bridgeAddress = (): string => `http://127.0.0.1:${bridgePort()}`;

// ----------------------------- The host ----------------------------- //

// Key resolution mirrors the extension's one rule: auth.json (via keyId borrowing) first, then the
// row's own env var. Never from anywhere else.
// The shared bearer rule (store.ts) — Kimi's OAuth token included, so the keyed executor, the picker's
// usability check and the Bridge model list all carry Kimi with no branch of their own.
const keyFor = bearerFor;

const clientFor = async (p: Provider): Promise<OpenAI | undefined> => {
  const key = await keyFor(p);
  if (!key) return undefined;
  const baseURL = resolveBaseUrl(p, home.readConfig().customBaseUrl ?? '');
  if (!baseURL) return undefined;
  return new OpenAI({ apiKey: key, baseURL });
};

// Build the engine over this face's store. Every getter reads fresh (ADR-0002), and accessSecret
// goes through ensureBridgeSecret so the listener always checks the live stored value.
export const createTuiBridge = (log: (message: string) => void) => {
  let loggingStarted = false;
  return createBridgeServer({
    providers: PROVIDERS,
    modelMap: () => home.readConfig().models ?? {},
    customBaseUrl: () => home.readConfig().customBaseUrl ?? '',
    keyFor,
    clientFor,
    codexSignedIn: () => codexAuth.isSignedIn(),
    codexCreds: () => codexAuth.current(),
    anthropicSignedIn: () => anthropicAuth.isSignedIn(),
    anthropicCreds: () => anthropicAuth.current(),
    xaiSignedIn: () => xaiAuth.isSignedIn(),
    xaiCreds: () => xaiAuth.current(),
    antigravitySignedIn: () => antigravityAuth.isSignedIn(),
    antigravityCreds: () => antigravityAuth.current(),
    effort: () => home.readConfig().effort ?? DEFAULT_EFFORT,
    activeProviderId: () => activeProvider().id,
    routingMap: () => home.readConfig().routing ?? EMPTY_ROUTING_MAP,
    aliasPickerShowsModel: () => home.readConfig().bridge?.aliasPickerShowsModel ?? true,
    aliasOnlyModels: () => effectiveAliasOnly(home.readConfig()),
    port: bridgePort,
    accessSecret: ensureBridgeSecret,
    log: (message) => {
      // The first engine line follows a successful bind. Idle TUI instances and failed starts must
      // leave the active host's log alone; later /bridge toggles stay in the same session log.
      if (!loggingStarted) { rotateBridgeLog(); loggingStarted = true; }
      appendBridgeLog(message);
      log(message);
    },
    // #171: the statusline snapshot lands in the same store the config does, so the wisp-slot statusline
    // script reads it straight out of ~/.wisp without knowing which face is hosting.
    recordStatus: (status) => home.writeStatus(status),
  });
};
