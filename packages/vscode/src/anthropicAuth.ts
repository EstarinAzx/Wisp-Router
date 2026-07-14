// ----------------- anthropicAuth.ts — Wisp: Claude.ai (Anthropic) OAuth sign-in + token store ----------------- //

/*
 * Depends on:
 *   - injected store accessors: the anthropic slice of ~/.wisp/auth.json (ADR-0002) — extension.ts
 *     wires them to its WispHome, so this module never touches the filesystem layout itself.
 *   - injected openExternal (system browser) — keeps the module decoupled from the editor host.
 *   - node http/net: a one-shot localhost server that captures the OAuth redirect (NOT an OAuth server,
 *     just a redirect catcher).
 *   - @wisp/core: the shared PKCE/state generators + the pure token cores (AnthropicCreds shape,
 *     tokensToAnthropicCreds, shouldRefreshAnthropicToken, isAnthropicSignedIn) —
 *     all unit-tested and vscode-free.
 *
 * Data shapes:
 *   - AnthropicCreds (from @wisp/core): { accessToken?, refreshToken?, expiresAt? } — the stored token
 *     bundle. The OAuth access token is the bearer for the subscription Messages backend; expiresAt is
 *     an absolute epoch-ms deadline computed at exchange time (Anthropic tokens carry no JWT exp).
 *   - AnthropicCredsStore: { read, write } over that bundle — read undefined = never signed in.
 *
 * Flow: Claude Code's published OAuth app (client_id 9d1c250a-…, PKCE S256, OS-assigned loopback
 * redirect). Sign-in opens the browser to the claude.ai consent page, captures the code on the loopback,
 * exchanges it for tokens (JSON body), and stores them. current() reads the store and refreshes when the
 * token is within 5 minutes of expiry.
 */

import { createServer } from 'http';
import type { AddressInfo } from 'net';
import {
  AnthropicCreds, codeVerifier, codeChallenge, oauthState,
  tokensToAnthropicCreds, shouldRefreshAnthropicToken, isAnthropicSignedIn,
} from '@wisp/core';

// ----------------------------- Constants ----------------------------- //

// Claude Code's published OAuth app — the same public values openclaude ships with. The client id is a
// public native-app client (not a secret); the redirect is any loopback port (Anthropic's native flow
// accepts any), so no port needs registering.
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const ANTHROPIC_CALLBACK_PATH = '/callback';
// The full scope set Claude Code's OAuth app registers — mirrored exactly so the subscriber consent +
// inference behave identically to the reference. user:inference is the gate that enables Messages calls.
const ANTHROPIC_SCOPE = 'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload org:create_api_key';
// Abandon a sign-in the user never completes, so the loopback server can't linger forever.
const OAUTH_TIMEOUT_MS = 5 * 60_000;

// ----------------------------- Authorize URL + token exchange ----------------------------- //

// Build the claude.ai authorize URL. code=true requests the auth-code flow; the loopback redirect_uri
// must match the token exchange byte-for-byte (hence the shared port).
const buildAuthorizeUrl = (port: number, challenge: string, state: string): string => {
  const url = new URL(ANTHROPIC_AUTHORIZE_URL);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', `http://localhost:${port}${ANTHROPIC_CALLBACK_PATH}`);
  url.searchParams.set('scope', ANTHROPIC_SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
};

// Exchange the authorization code for tokens (the second leg of the PKCE flow). Anthropic's token
// endpoint takes a JSON body (unlike Codex's form-encoded one); redirect_uri must match /authorize
// byte-for-byte, hence the shared port. now is the clock that stamps the absolute expiry.
const exchangeCode = async (code: string, verifier: string, state: string, port: number, now: number): Promise<AnthropicCreds> => {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `http://localhost:${port}${ANTHROPIC_CALLBACK_PATH}`,
      client_id: ANTHROPIC_CLIENT_ID,
      code_verifier: verifier,
      state,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude token exchange failed (${res.status})${body.trim() ? `: ${body.trim()}` : '.'}`);
  }
  const creds = tokensToAnthropicCreds(await res.json() as { access_token?: string }, now);
  if (!creds.accessToken) throw new Error('Claude sign-in completed but no access token was returned.');
  return creds;
};

// ----------------------------- Loopback redirect capture ----------------------------- //

const SUCCESS_HTML =
  '<!doctype html><meta charset="utf-8"><title>Claude sign-in complete</title>' +
  '<body style="font-family:sans-serif;padding:32px;line-height:1.5"><h1>Claude sign-in complete</h1>' +
  '<p>You can close this tab and return to VS Code.</p></body>';

// Start a one-shot localhost server that resolves with the auth code when the browser is redirected
// back. Returns the bound port (so the authorize URL can use it) plus a promise for the code. The port
// is OS-assigned (listen 0) — Anthropic's native flow accepts any loopback port, and a fresh port can
// never clash with a concurrent Codex sign-in. The state parameter is checked here — a mismatch is a
// CSRF signal and rejects the flow.
const startCallbackServer = (expectedState: string): Promise<{ port: number; code: Promise<string>; close: () => void }> =>
  new Promise((resolve, reject) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const code = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });

    const server = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname !== ANTHROPIC_CALLBACK_PATH) { res.writeHead(404); res.end(); return; }
      const authCode = url.searchParams.get('code') ?? undefined;
      const state = url.searchParams.get('state') ?? undefined;
      if (!authCode) { res.writeHead(400); res.end('Missing authorization code'); rejectCode(new Error('No authorization code received.')); return; }
      if (state !== expectedState) { res.writeHead(400); res.end('Invalid state'); rejectCode(new Error('Claude OAuth state mismatch — sign-in aborted.')); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      resolveCode(authCode);
    });

    server.on('error', (err) => reject(new Error(`Claude sign-in could not start its callback server: ${err.message}`)));
    server.on('listening', () => {
      resolve({ port: (server.address() as AddressInfo).port, code, close: () => { server.removeAllListeners(); server.close(); } });
    });
    server.listen(0, 'localhost');
  });

// Run the full OAuth flow: stand up the loopback, open the browser, wait for the redirect (or time out),
// then exchange the code. The server is always torn down.
const runAnthropicOAuth = async (openExternal: (url: string) => Thenable<boolean>): Promise<AnthropicCreds> => {
  const verifier = codeVerifier();
  const challenge = await codeChallenge(verifier);
  const state = oauthState();
  const { port, code, close } = await startCallbackServer(state);
  try {
    await openExternal(buildAuthorizeUrl(port, challenge, state));
    const authCode = await Promise.race([
      code,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Claude sign-in timed out.')), OAUTH_TIMEOUT_MS)),
    ]);
    return exchangeCode(authCode, verifier, state, port, Date.now());
  } finally {
    close();
  }
};

// ----------------------------- AnthropicAuth — store + refresh ----------------------------- //

// The anthropic slice of ~/.wisp/auth.json, as extension.ts exposes it.
export type AnthropicCredsStore = {
  read: () => AnthropicCreds | undefined;
  write: (creds: AnthropicCreds) => void;
};

// Owns the Anthropic token lifecycle against one auth.json slice. extension.ts holds a single instance
// and drives sign-in/out commands + the Inquire anthropic branch through it.
export class AnthropicAuth {
  constructor(
    private readonly store: AnthropicCredsStore,
    private readonly openExternal: (url: string) => Thenable<boolean>,
    private readonly log: (message: string) => void,
  ) {}

  // Refresh the access token when it's within the 5-minute skew window, persisting the new bundle.
  // Two processes share auth.json (extension + TUI), so RE-READ before refreshing (#59): if the other
  // process already rotated the token, use its bundle instead of firing our stale refresh token.
  // Subscribers OMIT scopes on refresh so the backend re-expands them. A failed refresh is non-fatal —
  // keep the existing creds (they may still work; the live call surfaces a 401).
  private refreshIfNeeded = async (creds: AnthropicCreds): Promise<AnthropicCreds> => {
    if (!creds.refreshToken || !shouldRefreshAnthropicToken(creds, Date.now())) return creds;
    const fresh = this.store.read() ?? creds;
    if (!shouldRefreshAnthropicToken(fresh, Date.now())) return fresh;
    if (!fresh.refreshToken) return fresh;
    let next: AnthropicCreds;
    try {
      const res = await fetch(ANTHROPIC_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: fresh.refreshToken, client_id: ANTHROPIC_CLIENT_ID }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { this.log(`[anthropic] token refresh failed (${res.status})`); return fresh; }
      const payload = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
      next = tokensToAnthropicCreds(payload, Date.now());
      // The refresh response may omit a fresh refresh_token — keep the old one so the next refresh works.
      if (!next.refreshToken) next.refreshToken = fresh.refreshToken;
    } catch (err) {
      this.log(`[anthropic] token refresh error: ${String(err)}`);
      return fresh;
    }
    // Persist OUTSIDE the fetch catch: the rotation already happened server-side, so a failed auth.json
    // write must not discard the new bundle — keep using it in memory and let a later write retry.
    try { this.store.write(next); } catch (err) { this.log(`[anthropic] token persist error: ${String(err)}`); }
    return next;
  };

  // Sign in via the browser OAuth flow and persist the result.
  signIn = async (): Promise<AnthropicCreds> => {
    const creds = await runAnthropicOAuth(this.openExternal);
    this.store.write(creds);
    return creds;
  };

  // Sign out by writing an empty TOMBSTONE rather than deleting the field — mirrors Codex so a present-
  // but-bearer-less blob reads as "signed out" (isAnthropicSignedIn === false).
  signOut = (): void => this.store.write({});

  // The credentials to use right now: the stored bundle, refreshed if near expiry. undefined = not signed in.
  current = async (): Promise<AnthropicCreds | undefined> => {
    const creds = this.store.read();
    return creds ? this.refreshIfNeeded(creds) : undefined;
  };

  // Cheap signed-in check for UI/usability — read-only (no refresh round-trip).
  isSignedIn = async (): Promise<boolean> => isAnthropicSignedIn(this.store.read());
}
