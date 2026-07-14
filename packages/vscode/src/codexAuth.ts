// ----------------- codexAuth.ts — Wisp: Codex (ChatGPT) OAuth sign-in + token store ----------------- //

/*
 * Depends on:
 *   - injected store accessors: the codex slice of ~/.wisp/auth.json (ADR-0002) — extension.ts wires
 *     them to its WispHome, so this module never touches the filesystem layout itself.
 *   - injected openExternal (system browser) — keeps the module decoupled from the editor host.
 *   - node http/net: a one-shot localhost server that captures the OAuth redirect (NOT an OAuth server,
 *     just a redirect catcher).
 *   - node crypto: PKCE (S256) + CSRF state.
 *   - node fs/os/path: import an existing Codex CLI login from ~/.codex/auth.json.
 *   - @wisp/core: the pure introspection cores (parseChatgptAccountId, shouldRefreshCodexToken,
 *     parseCodexAuthJson, isCodexSignedIn) + the CodexCreds shape — all unit-tested, vscode-free.
 *
 * Data shapes:
 *   - CodexCreds (from @wisp/core): { accessToken?, refreshToken?, idToken?, accountId?, apiKey? } —
 *     the stored token bundle. The OAuth access token is the bearer for the subscription Codex backend.
 *   - CodexCredsStore: { read, write } over that bundle — read undefined = never signed in (distinct
 *     from the {} sign-out tombstone).
 *
 * Flow: published Codex-CLI OAuth app (client_id app_EMoamEEZ…, PKCE S256, loopback :1455 redirect,
 * originator codex_cli_rs). Sign-in opens the browser, captures the code on the loopback, exchanges it
 * for tokens, and stores them. current() reads the store (importing ~/.codex/auth.json on first use) and
 * refreshes when the token is within 60s of expiry.
 */

import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { randomBytes, webcrypto } from 'crypto';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { CodexCreds, parseChatgptAccountId, parseCodexAuthJson, shouldRefreshCodexToken, isCodexSignedIn } from '@wisp/core';

// ----------------------------- Constants ----------------------------- //

// The published Codex-CLI OAuth app. These are the same public values the Codex CLI ships with — the
// client id is not a secret (it's a public native-app client), and the redirect must be the registered
// loopback. originator marks the request as coming from the Codex CLI surface.
const CODEX_ISSUER = 'https://auth.openai.com';
const CODEX_TOKEN_URL = `${CODEX_ISSUER}/oauth/token`;
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_CALLBACK_PORT = 1455;
const CODEX_CALLBACK_PATH = '/auth/callback';
const CODEX_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
const CODEX_ORIGINATOR = 'codex_cli_rs';
// Abandon a sign-in the user never completes, so the loopback server can't linger forever.
const OAUTH_TIMEOUT_MS = 5 * 60_000;

// ----------------------------- PKCE + state ----------------------------- //

// base64url without padding — the form OAuth PKCE + the authorize URL expect.
const base64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const codeVerifier = (): string => base64url(randomBytes(32));
const codeChallenge = async (verifier: string): Promise<string> =>
  base64url(Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
const oauthState = (): string => base64url(randomBytes(32));

// ----------------------------- Authorize URL + token exchange ----------------------------- //

// Build the provider authorize URL. The extra Codex flags (id_token_add_organizations,
// codex_cli_simplified_flow) + originator mirror the Codex CLI so the consent flow behaves identically.
const buildAuthorizeUrl = (port: number, challenge: string, state: string): string => {
  const url = new URL(`${CODEX_ISSUER}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CODEX_CLIENT_ID);
  url.searchParams.set('redirect_uri', `http://localhost:${port}${CODEX_CALLBACK_PATH}`);
  url.searchParams.set('scope', CODEX_SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('originator', CODEX_ORIGINATOR);
  return url.toString();
};

// Turn an OAuth token response into CodexCreds, deriving the ChatGPT account id from whichever token
// carries it (the request bearer + account id are both required to reach the Codex backend).
const tokensToCreds = (payload: { access_token?: string; refresh_token?: string; id_token?: string }): CodexCreds => ({
  accessToken: payload.access_token,
  refreshToken: payload.refresh_token,
  idToken: payload.id_token,
  accountId: parseChatgptAccountId(payload.id_token) ?? parseChatgptAccountId(payload.access_token),
});

// Exchange the authorization code for tokens (the second leg of the PKCE flow). redirect_uri must match
// the one sent to /authorize byte-for-byte, hence the shared port.
const exchangeCode = async (code: string, verifier: string, port: number): Promise<CodexCreds> => {
  const res = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `http://localhost:${port}${CODEX_CALLBACK_PATH}`,
      client_id: CODEX_CLIENT_ID,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Codex token exchange failed (${res.status})${body.trim() ? `: ${body.trim()}` : '.'}`);
  }
  const creds = tokensToCreds(await res.json() as { access_token?: string });
  if (!creds.accessToken) throw new Error('Codex sign-in completed but no access token was returned.');
  return creds;
};

// ----------------------------- Loopback redirect capture ----------------------------- //

const SUCCESS_HTML =
  '<!doctype html><meta charset="utf-8"><title>Codex sign-in complete</title>' +
  '<body style="font-family:sans-serif;padding:32px;line-height:1.5"><h1>Codex sign-in complete</h1>' +
  '<p>You can close this tab and return to VS Code.</p></body>';

// Start a one-shot localhost server that resolves with the auth code when the browser is redirected
// back. Returns the bound port (so the authorize URL can use it) plus a promise for the code. Port 1455
// is the registered redirect; if it's busy we fall back to an OS-assigned port (the redirect_uri is
// rebuilt from the actual port, and OpenAI's native-app flow accepts any localhost port). The state
// parameter is checked here — a mismatch is a CSRF signal and rejects the flow.
const startCallbackServer = (expectedState: string): Promise<{ port: number; code: Promise<string>; close: () => void }> =>
  new Promise((resolve, reject) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const code = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });

    const server = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname !== CODEX_CALLBACK_PATH) { res.writeHead(404); res.end(); return; }
      const authCode = url.searchParams.get('code') ?? undefined;
      const state = url.searchParams.get('state') ?? undefined;
      if (!authCode) { res.writeHead(400); res.end('Missing authorization code'); rejectCode(new Error('No authorization code received.')); return; }
      if (state !== expectedState) { res.writeHead(400); res.end('Invalid state'); rejectCode(new Error('Codex OAuth state mismatch — sign-in aborted.')); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      resolveCode(authCode);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') { server.listen(0, 'localhost'); return; }
      reject(new Error(`Codex sign-in could not start its callback server: ${err.message}`));
    });
    server.on('listening', () => {
      resolve({ port: (server.address() as AddressInfo).port, code, close: () => { server.removeAllListeners(); server.close(); } });
    });
    server.listen(CODEX_CALLBACK_PORT, 'localhost');
  });

// Run the full OAuth flow: stand up the loopback, open the browser, wait for the redirect (or time out),
// then exchange the code. The server is always torn down.
const runCodexOAuth = async (openExternal: (url: string) => Thenable<boolean>): Promise<CodexCreds> => {
  const verifier = codeVerifier();
  const challenge = await codeChallenge(verifier);
  const state = oauthState();
  const { port, code, close } = await startCallbackServer(state);
  try {
    await openExternal(buildAuthorizeUrl(port, challenge, state));
    const authCode = await Promise.race([
      code,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Codex sign-in timed out.')), OAUTH_TIMEOUT_MS)),
    ]);
    return exchangeCode(authCode, verifier, port);
  } finally {
    close();
  }
};

// ----------------------------- CodexAuth — store + import + refresh ----------------------------- //

// The codex slice of ~/.wisp/auth.json, as extension.ts exposes it. read() undefined = the field has
// NEVER been written (truly first use); the {} tombstone means signed out.
export type CodexCredsStore = {
  read: () => CodexCreds | undefined;
  write: (creds: CodexCreds) => void;
};

// Owns the Codex token lifecycle against one auth.json slice. extension.ts holds a single instance and
// drives sign-in/out commands + the Inquire codex branch through it.
export class CodexAuth {
  constructor(
    private readonly store: CodexCredsStore,
    private readonly openExternal: (url: string) => Thenable<boolean>,
    private readonly log: (message: string) => void,
  ) {}

  // Import an existing Codex CLI login (~/.codex/auth.json, or $CODEX_HOME) so a CLI user isn't forced
  // to sign in again. Missing/unreadable/garbage file → nothing to import.
  private importAuthJson = async (): Promise<CodexCreds | undefined> => {
    const file = join(process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'), 'auth.json');
    try { return parseCodexAuthJson(JSON.parse(await readFile(file, 'utf8'))); } catch { return undefined; }
  };

  // Refresh the access token when it's within the skew window, persisting the new bundle. Two processes
  // share auth.json (extension + TUI), so RE-READ before refreshing (#59): if the other process already
  // rotated the token, use its bundle — firing our stale (possibly single-use) refresh token instead
  // could invalidate the fresh one. A failed refresh is non-fatal — keep the existing creds (they may
  // still work; the live call surfaces a 401).
  private refreshIfNeeded = async (creds: CodexCreds): Promise<CodexCreds> => {
    if (!creds.refreshToken || !shouldRefreshCodexToken({ accessToken: creds.accessToken, idToken: creds.idToken }, Date.now())) return creds;
    const fresh = this.store.read() ?? creds;
    if (!shouldRefreshCodexToken({ accessToken: fresh.accessToken, idToken: fresh.idToken }, Date.now())) return fresh;
    if (!fresh.refreshToken) return fresh;
    let next: CodexCreds;
    try {
      const res = await fetch(CODEX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CODEX_CLIENT_ID, grant_type: 'refresh_token', refresh_token: fresh.refreshToken }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { this.log(`[codex] token refresh failed (${res.status})`); return fresh; }
      const payload = await res.json() as { access_token?: string; refresh_token?: string; id_token?: string };
      next = {
        accessToken: payload.access_token ?? fresh.accessToken,
        refreshToken: payload.refresh_token ?? fresh.refreshToken,
        idToken: payload.id_token ?? fresh.idToken,
        accountId: parseChatgptAccountId(payload.id_token) ?? fresh.accountId,
      };
    } catch (err) {
      this.log(`[codex] token refresh error: ${String(err)}`);
      return fresh;
    }
    // Persist OUTSIDE the fetch catch: the rotation already happened server-side (the old refresh token
    // may be consumed), so a failed auth.json write must not discard the new bundle — keep using it in
    // memory and let a later write retry.
    try { this.store.write(next); } catch (err) { this.log(`[codex] token persist error: ${String(err)}`); }
    return next;
  };

  // Sign in via the browser OAuth flow and persist the result.
  signIn = async (): Promise<CodexCreds> => {
    const creds = await runCodexOAuth(this.openExternal);
    this.store.write(creds);
    return creds;
  };

  // Sign out by writing an empty TOMBSTONE rather than deleting the field: a present-but-bearer-less blob
  // reads as "signed out" AND suppresses the ~/.codex/auth.json re-import below. Deleting instead would
  // let the import immediately re-sign-in a Codex-CLI user, so sign-out could never stick.
  signOut = (): void => this.store.write({});

  // The credentials to use right now: the stored bundle, else — only when the field has NEVER been
  // written (truly first use, not a sign-out tombstone) — a one-time import of the CLI's auth.json
  // (persisted so the next read is fast), refreshed if near expiry. undefined = not signed in.
  current = async (): Promise<CodexCreds | undefined> => {
    let creds = this.store.read();
    if (creds === undefined) {
      creds = await this.importAuthJson();
      if (creds) this.store.write(creds);
    }
    return creds ? this.refreshIfNeeded(creds) : undefined;
  };

  // Cheap signed-in check for UI/usability — read-only (no refresh round-trip). The stored bundle wins;
  // only an unwritten field (undefined, not a tombstone) falls back to an importable auth.json.
  isSignedIn = async (): Promise<boolean> => {
    const stored = this.store.read();
    return isCodexSignedIn(stored === undefined ? await this.importAuthJson() : stored);
  };
}
