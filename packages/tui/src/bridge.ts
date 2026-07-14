// ---------------- bridge.ts — the TUI's Bridge host: engine wiring over the ~/.wisp store ---------------- //

/*
 * Depends on:
 *   - crypto (node stdlib): generate the access secret when none is stored yet.
 *   - openai: the per-Provider client the engine's keyed path streams through.
 *   - @wisp/core: createBridgeServer (the engine) + DEFAULT_BRIDGE_PORT, catalog resolvers,
 *     the empty routing map, the effort default.
 *   - ./store: the shared ~/.wisp handle + OAuth managers (#63).
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
  EMPTY_ROUTING_MAP, DEFAULT_EFFORT, type Provider,
} from '@wisp/core';
import { home, activeProvider, codexAuth, anthropicAuth } from './store';

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
const keyFor = async (p: Provider): Promise<string> => {
  const stored = home.readAuth().keys?.[resolveKeyId(p)];
  return stored?.trim() || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : '') || '';
};

const clientFor = async (p: Provider): Promise<OpenAI | undefined> => {
  const key = await keyFor(p);
  if (!key) return undefined;
  const baseURL = resolveBaseUrl(p, home.readConfig().customBaseUrl ?? '');
  if (!baseURL) return undefined;
  return new OpenAI({ apiKey: key, baseURL });
};

// Build the engine over this face's store. Every getter reads fresh (ADR-0002), and accessSecret
// goes through ensureBridgeSecret so the listener always checks the live stored value.
export const createTuiBridge = (log: (message: string) => void) =>
  createBridgeServer({
    providers: PROVIDERS,
    modelMap: () => home.readConfig().models ?? {},
    customBaseUrl: () => home.readConfig().customBaseUrl ?? '',
    keyFor,
    clientFor,
    codexSignedIn: () => codexAuth.isSignedIn(),
    codexCreds: () => codexAuth.current(),
    anthropicSignedIn: () => anthropicAuth.isSignedIn(),
    anthropicCreds: () => anthropicAuth.current(),
    effort: () => home.readConfig().effort ?? DEFAULT_EFFORT,
    activeProviderId: () => activeProvider().id,
    routingMap: () => home.readConfig().routing ?? EMPTY_ROUTING_MAP,
    aliasPickerShowsModel: () => home.readConfig().bridge?.aliasPickerShowsModel ?? true,
    aliasOnlyModels: () => home.readConfig().bridge?.aliasOnlyModels ?? false,
    port: bridgePort,
    accessSecret: ensureBridgeSecret,
    log,
  });
