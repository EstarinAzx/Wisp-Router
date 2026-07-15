// ----------------- xaiAuth.ts — Wisp: Grok (xAI) OAuth sign-in + token store ----------------- //

/*
 * Depends on:
 *   - injected store accessors: the xai slice of ~/.wisp/auth.json (ADR-0002) — each face (the extension,
 *     the TUI) wires them to its WispHome, so this module never touches the fs layout itself.
 *   - injected openExternal (system browser) — keeps the module decoupled from any host (runs from VS Code
 *     and the terminal alike).
 *   - node http/net: a one-shot localhost server that captures the OAuth redirect (a catcher, not a server).
 *   - node fs/os/path: import an existing Grok CLI login from ~/.grok/auth.json.
 *   - ./catalog: the shared PKCE/state generators + the pure cores (XaiCreds, tokensToXaiCreds,
 *     shouldRefreshXaiToken, isXaiSignedIn, parseGrokAuthJson, isXaiEndpoint).
 *
 * Data shapes:
 *   - XaiCreds (from ./catalog): { accessToken?, refreshToken?, expiresAt?, tokenEndpoint? } — the stored
 *     bundle. The OAuth access token is the bearer for the subscription Grok backend; expiresAt is an
 *     absolute epoch-ms deadline stamped at exchange time; tokenEndpoint caches the discovered endpoint (D7).
 *   - XaiCredsStore: { read, write } over that bundle — read undefined = never signed in (distinct from the
 *     {} sign-out tombstone).
 *
 * Flow: xAI's published Grok-CLI OAuth app (client b1a00492-…, PKCE S256, loopback :56121). Endpoints are
 * discovered once via the OIDC well-known doc (D7) — both validated to an *.x.ai host before any bearer is
 * sent. Sign-in opens the browser, captures the code on the loopback, exchanges it (form-encoded), and
 * stores the tokens with the token endpoint cached. current() reads the store (importing ~/.grok/auth.json
 * on first use) and refreshes when the token is within 2 minutes of expiry.
 */

import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  XaiCreds, codeVerifier, codeChallenge, oauthState,
  tokensToXaiCreds, shouldRefreshXaiToken, isXaiSignedIn, parseGrokAuthJson, isXaiEndpoint,
} from './catalog';

// ----------------------------- Constants ----------------------------- //

// The published Grok-CLI OAuth app — all public values (native-app client id is not a secret). The redirect
// is the registered loopback; scope's grok-cli:access + api:access gate the subscription models.
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_DISCOVERY_URL = 'https://auth.x.ai/.well-known/openid-configuration';
const XAI_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
const XAI_CALLBACK_PORT = 56121;
const XAI_CALLBACK_PATH = '/callback';
// Abandon a sign-in the user never completes, so the loopback server can't linger forever.
const OAUTH_TIMEOUT_MS = 5 * 60_000;

const redirectUri = (port: number): string => `http://127.0.0.1:${port}${XAI_CALLBACK_PATH}`;

// ----------------------------- OIDC discovery (D7) ----------------------------- //

type XaiEndpoints = { authorizationEndpoint: string; tokenEndpoint: string };

// Discover the OAuth endpoints from the OIDC well-known doc rather than hardcoding paths xAI could move.
// Both endpoints MUST resolve to an *.x.ai host — a doc that points either elsewhere is a hijack signal and
// aborts before the bearer is ever sent.
const discoverXaiEndpoints = async (): Promise<XaiEndpoints> => {
  const res = await fetch(XAI_DISCOVERY_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`xAI OIDC discovery failed (${res.status}).`);
  const doc = await res.json() as { authorization_endpoint?: string; token_endpoint?: string };
  const authorizationEndpoint = doc.authorization_endpoint ?? '';
  const tokenEndpoint = doc.token_endpoint ?? '';
  if (!isXaiEndpoint(authorizationEndpoint) || !isXaiEndpoint(tokenEndpoint))
    throw new Error('xAI OIDC discovery returned a non-x.ai endpoint — sign-in aborted.');
  return { authorizationEndpoint, tokenEndpoint };
};

// ----------------------------- Authorize URL + token exchange ----------------------------- //

// Build the discovered authorize URL. redirect_uri must match the token exchange byte-for-byte (shared port).
const buildAuthorizeUrl = (authorizationEndpoint: string, port: number, challenge: string, state: string): string => {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', XAI_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri(port));
  url.searchParams.set('scope', XAI_SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
};

// Exchange the authorization code for tokens (second leg of PKCE). Form-encoded (like Codex); now stamps the
// absolute expiry off expires_in. redirect_uri must match /authorize byte-for-byte, hence the shared port.
const exchangeCode = async (tokenEndpoint: string, code: string, verifier: string, port: number, now: number): Promise<XaiCreds> => {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(port),
      client_id: XAI_CLIENT_ID,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Grok token exchange failed (${res.status})${body.trim() ? `: ${body.trim()}` : '.'}`);
  }
  const creds = tokensToXaiCreds(await res.json() as { access_token?: string }, now);
  if (!creds.accessToken) throw new Error('Grok sign-in completed but no access token was returned.');
  return creds;
};

// ----------------------------- Loopback redirect capture ----------------------------- //

const SUCCESS_HTML =
  '<!doctype html><meta charset="utf-8"><title>Grok sign-in complete</title>' +
  '<body style="font-family:sans-serif;padding:32px;line-height:1.5"><h1>Grok sign-in complete</h1>' +
  '<p>You can close this tab and return to Wisp.</p></body>';

// One-shot loopback server that resolves with the auth code on redirect. Port 56121 is the registered
// redirect; if busy we fall back to an OS-assigned port (redirect_uri is rebuilt from the actual port). The
// state parameter is checked here — a mismatch is a CSRF signal and rejects the flow.
const startCallbackServer = (expectedState: string): Promise<{ port: number; code: Promise<string>; close: () => void }> =>
  new Promise((resolve, reject) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const code = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });

    const server = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://127.0.0.1');
      if (url.pathname !== XAI_CALLBACK_PATH) { res.writeHead(404); res.end(); return; }
      const authCode = url.searchParams.get('code') ?? undefined;
      const state = url.searchParams.get('state') ?? undefined;
      if (!authCode) { res.writeHead(400); res.end('Missing authorization code'); rejectCode(new Error('No authorization code received.')); return; }
      if (state !== expectedState) { res.writeHead(400); res.end('Invalid state'); rejectCode(new Error('Grok OAuth state mismatch — sign-in aborted.')); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      resolveCode(authCode);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') { server.listen(0, '127.0.0.1'); return; }
      reject(new Error(`Grok sign-in could not start its callback server: ${err.message}`));
    });
    server.on('listening', () => {
      resolve({ port: (server.address() as AddressInfo).port, code, close: () => { server.removeAllListeners(); server.close(); } });
    });
    server.listen(XAI_CALLBACK_PORT, '127.0.0.1');
  });

// Run the full OAuth flow: discover endpoints, stand up the loopback, open the browser, wait for the redirect
// (or time out), exchange the code, and cache the token endpoint in the creds (D7). Server always torn down.
const runXaiOAuth = async (openExternal: (url: string) => PromiseLike<boolean>): Promise<XaiCreds> => {
  const { authorizationEndpoint, tokenEndpoint } = await discoverXaiEndpoints();
  const verifier = codeVerifier();
  const challenge = await codeChallenge(verifier);
  const state = oauthState();
  const { port, code, close } = await startCallbackServer(state);
  try {
    await openExternal(buildAuthorizeUrl(authorizationEndpoint, port, challenge, state));
    const authCode = await Promise.race([
      code,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Grok sign-in timed out.')), OAUTH_TIMEOUT_MS)),
    ]);
    const creds = await exchangeCode(tokenEndpoint, authCode, verifier, port, Date.now());
    return { ...creds, tokenEndpoint };
  } finally {
    close();
  }
};

// ----------------------------- XaiAuth — store + import + refresh ----------------------------- //

// The xai slice of ~/.wisp/auth.json, as the host face exposes it. read() undefined = the field has NEVER
// been written (truly first use); the {} tombstone means signed out.
export type XaiCredsStore = {
  read: () => XaiCreds | undefined;
  write: (creds: XaiCreds) => void;
};

// Owns the Grok token lifecycle against one auth.json slice. Each face holds a single instance and drives
// sign-in/out + its xai send paths through it.
export class XaiAuth {
  constructor(
    private readonly store: XaiCredsStore,
    private readonly openExternal: (url: string) => PromiseLike<boolean>,
    private readonly log: (message: string) => void,
  ) {}

  // Import an existing Grok CLI login (~/.grok/auth.json, or $GROK_HOME) so a CLI user isn't forced to sign
  // in again (D6). Missing/unreadable/garbage file → nothing to import.
  private importAuthJson = async (): Promise<XaiCreds | undefined> => {
    const file = join(process.env.GROK_HOME?.trim() || join(homedir(), '.grok'), 'auth.json');
    try { return parseGrokAuthJson(JSON.parse(await readFile(file, 'utf8'))); } catch { return undefined; }
  };

  // Refresh the access token when it's within the 2-minute skew window, persisting the new bundle. Two
  // processes share auth.json (extension + TUI), so RE-READ before refreshing: if the other process already
  // rotated the token, use its bundle instead of firing our stale (single-use) refresh token. The token
  // endpoint is the cached one (D7), else discovered here. A failed refresh is non-fatal — keep the existing
  // creds (they may still work; the live call surfaces a 401).
  private refreshIfNeeded = async (creds: XaiCreds): Promise<XaiCreds> => {
    if (!creds.refreshToken || !shouldRefreshXaiToken(creds, Date.now())) return creds;
    const fresh = this.store.read() ?? creds;
    if (!shouldRefreshXaiToken(fresh, Date.now())) return fresh;
    if (!fresh.refreshToken) return fresh;
    let next: XaiCreds;
    try {
      const tokenEndpoint = fresh.tokenEndpoint ?? (await discoverXaiEndpoints()).tokenEndpoint;
      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: XAI_CLIENT_ID, grant_type: 'refresh_token', refresh_token: fresh.refreshToken }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { this.log(`[xai] token refresh failed (${res.status})`); return fresh; }
      const payload = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
      next = tokensToXaiCreds(payload, Date.now());
      // The refresh response may omit a fresh refresh_token — keep the old one so the next refresh works.
      if (!next.refreshToken) next.refreshToken = fresh.refreshToken;
      next.tokenEndpoint = tokenEndpoint; // keep the endpoint cached for the next refresh
    } catch (err) {
      this.log(`[xai] token refresh error: ${String(err)}`);
      return fresh;
    }
    // Persist OUTSIDE the fetch catch: the rotation already happened server-side, so a failed auth.json
    // write must not discard the new bundle — keep using it in memory and let a later write retry.
    try { this.store.write(next); } catch (err) { this.log(`[xai] token persist error: ${String(err)}`); }
    return next;
  };

  // Sign in via the browser OAuth flow and persist the result.
  signIn = async (): Promise<XaiCreds> => {
    const creds = await runXaiOAuth(this.openExternal);
    this.store.write(creds);
    return creds;
  };

  // Sign out by writing an empty TOMBSTONE rather than deleting the field: a present-but-bearer-less blob
  // reads as "signed out" AND suppresses the ~/.grok/auth.json re-import below (else sign-out never sticks).
  signOut = (): void => this.store.write({});

  // The credentials to use right now: the stored bundle, else — only when the field has NEVER been written
  // (truly first use, not a sign-out tombstone) — a one-time import of the CLI's auth.json (persisted so the
  // next read is fast), refreshed if near expiry. undefined = not signed in.
  current = async (): Promise<XaiCreds | undefined> => {
    let creds = this.store.read();
    if (creds === undefined) {
      creds = await this.importAuthJson();
      if (creds) this.store.write(creds);
    }
    return creds ? this.refreshIfNeeded(creds) : undefined;
  };

  // Cheap signed-in check for UI/usability — read-only (no refresh round-trip). The stored bundle wins; only
  // an unwritten field (undefined, not a tombstone) falls back to an importable auth.json.
  isSignedIn = async (): Promise<boolean> => {
    const stored = this.store.read();
    return isXaiSignedIn(stored === undefined ? await this.importAuthJson() : stored);
  };
}
