// ----------------- antigravityAuth.ts — Wisp: Antigravity (Google) OAuth sign-in + token store ----------------- //

/*
 * Depends on:
 *   - injected store accessors: the antigravity slice of ~/.wisp/auth.json (ADR-0002) — each face wires them
 *     to its WispHome, so this module never touches the fs layout itself.
 *   - injected openExternal (system browser) — keeps the module host-free (#61: VS Code and terminal alike).
 *   - node http/net: a one-shot localhost server that captures the OAuth redirect (a catcher, not a server).
 *   - ./catalog: the shared PKCE/state generators + the pure cores (AntigravityCreds, tokensToAntigravityCreds,
 *     shouldRefreshAntigravityToken, isAntigravitySignedIn, parseAntigravityProject).
 *
 * Data shapes:
 *   - AntigravityCreds (from ./antigravity): { accessToken?, refreshToken?, expiresAt?, projectId? }. The
 *     projectId is the field no other kind has — see below.
 *   - AntigravityCredsStore: { read, write } over that bundle — read undefined = never signed in, `{}` = the
 *     sign-out tombstone.
 *
 * Flow: Antigravity's published desktop OAuth client (Google), PKCE S256, loopback :51121/oauth-callback.
 * Sign-in opens the Google consent page, captures the code on the loopback, exchanges it (form-encoded, with
 * the public desktop client secret), then bootstraps the Cloud Code project id. current() reads the store and
 * refreshes within 5 minutes of expiry.
 *
 * TWO HOSTS, DELIBERATELY. The project bootstrap is pinned to the PRODUCTION host while the turns themselves
 * go to the DAILY host (the catalog row's baseUrl, verified answering in #186). That asymmetry is the
 * reference's, and its own test pins it the same way — pointing loadCodeAssist at daily is an easy-looking
 * "consistency" fix that has never been verified to work.
 */

import { createServer } from 'http';
import type { AddressInfo } from 'net';
import {
  AntigravityCreds, codeVerifier, codeChallenge, oauthState,
  tokensToAntigravityCreds, shouldRefreshAntigravityToken, isAntigravitySignedIn,
  parseAntigravityProject, ANTIGRAVITY_HTTP_USER_AGENT,
} from './catalog';

// ----------------------------- Constants (all measured live in #186) ----------------------------- //

// Antigravity's published desktop OAuth client. Both values are public — a desktop client secret is not a
// secret in the OAuth sense (it ships in the client), which is exactly why PKCE is bolted on below.
const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const ANTIGRAVITY_CLIENT_SECRET = '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';
const ANTIGRAVITY_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ANTIGRAVITY_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// A REGISTERED redirect, unlike the loopback kinds that take any port — so no OS-assigned fallback here: a
// different port is simply refused by Google, and failing loudly on EADDRINUSE beats a silent redirect_uri
// mismatch after the user has already consented.
const ANTIGRAVITY_CALLBACK_PORT = 51121;
const ANTIGRAVITY_CALLBACK_PATH = '/oauth-callback';
const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ');
// The project bootstrap — PRODUCTION host (see the header note), not the daily host the turns use.
const ANTIGRAVITY_LOAD_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
// Abandon a sign-in the user never completes, so the loopback server can't linger forever.
const OAUTH_TIMEOUT_MS = 5 * 60_000;

const REDIRECT_URI = `http://localhost:${ANTIGRAVITY_CALLBACK_PORT}${ANTIGRAVITY_CALLBACK_PATH}`;

// ----------------------------- Authorize URL + token exchange ----------------------------- //

// Build the Google authorize URL. access_type=offline + prompt=consent are the pair that actually returns a
// refresh token (#186) — with either missing the bundle is access-token-only and the Provider dies an hour
// after sign-in. code_challenge is Wisp's addition over the reference's bare code flow; #186 proved S256 accepted.
const buildAuthorizeUrl = (challenge: string, state: string): string => {
  const url = new URL(ANTIGRAVITY_AUTH_URL);
  url.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ANTIGRAVITY_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
};

// Exchange the authorization code for tokens (the second leg of PKCE). Google's token endpoint is
// form-encoded and takes the desktop client secret alongside the verifier. now stamps the absolute expiry.
const exchangeCode = async (code: string, verifier: string, now: number): Promise<AntigravityCreds> => {
  const res = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Antigravity token exchange failed (${res.status})${body.trim() ? `: ${body.trim()}` : '.'}`);
  }
  const creds = tokensToAntigravityCreds(await res.json() as { access_token?: string }, now);
  if (!creds.accessToken) throw new Error('Antigravity sign-in completed but no access token was returned.');
  return creds;
};

// ----------------------------- Loopback redirect capture ----------------------------- //

const SUCCESS_HTML =
  '<!doctype html><meta charset="utf-8"><title>Antigravity sign-in complete</title>' +
  '<body style="font-family:sans-serif;padding:32px;line-height:1.5"><h1>Antigravity sign-in complete</h1>' +
  '<p>You can close this tab and return to Wisp.</p></body>';

// One-shot loopback server that resolves with the auth code on redirect. The port is FIXED (the registered
// redirect — see the constant), so EADDRINUSE is a real failure rather than something to hop around. The
// state parameter is checked here: a mismatch is a CSRF signal and rejects the flow.
const startCallbackServer = (expectedState: string): Promise<{ code: Promise<string>; close: () => void }> =>
  new Promise((resolve, reject) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const code = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });

    const server = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname !== ANTIGRAVITY_CALLBACK_PATH) { res.writeHead(404); res.end(); return; }
      const authCode = url.searchParams.get('code') ?? undefined;
      const state = url.searchParams.get('state') ?? undefined;
      if (!authCode) { res.writeHead(400); res.end('Missing authorization code'); rejectCode(new Error('No authorization code received.')); return; }
      if (state !== expectedState) { res.writeHead(400); res.end('Invalid state'); rejectCode(new Error('Antigravity OAuth state mismatch — sign-in aborted.')); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      resolveCode(authCode);
    });

    server.on('error', (err: NodeJS.ErrnoException) => reject(new Error(
      err.code === 'EADDRINUSE'
        ? `Antigravity sign-in needs port ${ANTIGRAVITY_CALLBACK_PORT}, which is already in use — close whatever holds it and retry.`
        : `Antigravity sign-in could not start its callback server: ${err.message}`)));
    server.on('listening', () => {
      resolve({ code, close: () => { server.removeAllListeners(); server.close(); } });
    });
    server.listen(ANTIGRAVITY_CALLBACK_PORT, 'localhost');
  });

// Run the full OAuth flow: stand up the loopback, open the browser, wait for the redirect (or time out),
// then exchange the code. The server is always torn down.
const runAntigravityOAuth = async (openExternal: (url: string) => PromiseLike<boolean>): Promise<AntigravityCreds> => {
  const verifier = codeVerifier();
  const challenge = await codeChallenge(verifier);
  const state = oauthState();
  const { code, close } = await startCallbackServer(state);
  try {
    await openExternal(buildAuthorizeUrl(challenge, state));
    const authCode = await Promise.race([
      code,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Antigravity sign-in timed out.')), OAUTH_TIMEOUT_MS)),
    ]);
    return exchangeCode(authCode, verifier, Date.now());
  } finally {
    close();
  }
};

// ----------------------------- Bootstrap — the Cloud Code project id ----------------------------- //

// Fetch the account's Cloud Code project. BEST-EFFORT by contract, like the Anthropic bootstrap: the access
// token is valid whether or not this answers, so every failure path (bad status, junk JSON, network, 10s
// timeout) resolves undefined rather than throwing. An absent project is a hard 400 at request-build time
// (#189) and is re-fetched by current() — it must never cost the user a browser round trip.
//
// ponytail: no onboardUser fallback. The reference polls a second endpoint to PROVISION a project when
// loadCodeAssist returns none; #186 got one straight back, and #185 scopes this to reading what exists. Add
// it only if a real account is ever seen with no project.
export const fetchAntigravityProject = async (accessToken: string): Promise<string | undefined> => {
  try {
    const res = await fetch(ANTIGRAVITY_LOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'User-Agent': ANTIGRAVITY_HTTP_USER_AGENT,
      },
      body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    return parseAntigravityProject(await res.json());
  } catch {
    return undefined;
  }
};

// ----------------------------- AntigravityAuth — store + refresh ----------------------------- //

// The antigravity slice of ~/.wisp/auth.json, as the host face exposes it.
export type AntigravityCredsStore = {
  read: () => AntigravityCreds | undefined;
  write: (creds: AntigravityCreds) => void;
};

// Owns the Antigravity token lifecycle against one auth.json slice. Each face holds a single instance and
// drives sign-in/out + its antigravity send paths through it.
export class AntigravityAuth {
  constructor(
    private readonly store: AntigravityCredsStore,
    private readonly openExternal: (url: string) => PromiseLike<boolean>,
    private readonly log: (message: string) => void,
  ) {}

  // Refresh the access token when it's within the 5-minute skew window, persisting the new bundle. Two
  // processes share auth.json (extension + TUI), so RE-READ before refreshing (#59): if the other process
  // already rotated the token, use its bundle instead of firing our spent refresh token. A failed refresh is
  // non-fatal — keep the existing creds (they may still work; the live call surfaces a 401).
  private refreshIfNeeded = async (creds: AntigravityCreds): Promise<AntigravityCreds> => {
    if (!creds.refreshToken || !shouldRefreshAntigravityToken(creds, Date.now())) return creds;
    const fresh = this.store.read() ?? creds;
    if (!shouldRefreshAntigravityToken(fresh, Date.now())) return fresh;
    if (!fresh.refreshToken) return fresh;
    let next: AntigravityCreds;
    try {
      const res = await fetch(ANTIGRAVITY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: fresh.refreshToken,
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { this.log(`[antigravity] token refresh failed (${res.status})`); return fresh; }
      const payload = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
      // Carry the project id over the rebuild — it belongs to the ACCOUNT, not the token, so a refresh must
      // not silently strip it and put every later turn back on the request-build 400.
      next = { ...(fresh.projectId ? { projectId: fresh.projectId } : {}), ...tokensToAntigravityCreds(payload, Date.now()) };
      // A malformed 200 must not erase the working bundle or its refresh deadline.
      if (typeof next.accessToken !== 'string' || !next.accessToken.trim()
        || typeof next.expiresAt !== 'number' || !Number.isFinite(next.expiresAt) || next.expiresAt <= Date.now()
        || (payload.refresh_token !== undefined && (typeof payload.refresh_token !== 'string' || !payload.refresh_token.trim()))) {
        this.log('[antigravity] token refresh returned invalid credentials');
        return fresh;
      }
      // Google's refresh response omits refresh_token — keep the old one so the next refresh works.
      if (!next.refreshToken) next.refreshToken = fresh.refreshToken;
    } catch (err) {
      this.log(`[antigravity] token refresh error: ${String(err)}`);
      return fresh;
    }
    // Persist OUTSIDE the fetch catch: the rotation already happened server-side, so a failed auth.json
    // write must not discard the new bundle — keep using it in memory and let a later write retry.
    try { this.store.write(next); } catch (err) { this.log(`[antigravity] token persist error: ${String(err)}`); }
    return next;
  };

  // Bootstrap the project id when the bundle has none (#188: "re-fetch if absent"). Signed-out bundles are
  // skipped — there is no bearer to ask with. A failure leaves the bundle as-is; the next call retries.
  private withProject = async (creds: AntigravityCreds): Promise<AntigravityCreds> => {
    if (creds.projectId || !creds.accessToken) return creds;
    const projectId = await fetchAntigravityProject(creds.accessToken);
    if (!projectId) return creds;
    const next = { ...creds, projectId };
    try { this.store.write(next); } catch (err) { this.log(`[antigravity] project persist error: ${String(err)}`); }
    return next;
  };

  // Sign in via the browser OAuth flow, bootstrap the project, and persist the result. The bootstrap is
  // best-effort: a failure still signs in (the tokens are good) and current() re-fetches later.
  signIn = async (): Promise<AntigravityCreds> => {
    const creds = await runAntigravityOAuth(this.openExternal);
    const projectId = creds.accessToken ? await fetchAntigravityProject(creds.accessToken) : undefined;
    const next = { ...creds, ...(projectId ? { projectId } : {}) };
    this.store.write(next);
    return next;
  };

  // Sign out by writing a TOMBSTONE rather than deleting the field — a present-but-bearer-less blob reads as
  // "signed out" (isAntigravitySignedIn === false) and survives a restart. The project id goes too: it
  // identifies the account that just left, not the install.
  signOut = (): void => this.store.write({});

  // The credentials to use right now: the stored bundle, refreshed if near expiry, with the project id
  // bootstrapped if it is missing. undefined = not signed in.
  current = async (): Promise<AntigravityCreds | undefined> => {
    const creds = this.store.read();
    return creds ? this.withProject(await this.refreshIfNeeded(creds)) : undefined;
  };

  // Cheap signed-in check for UI/usability — read-only (no refresh or bootstrap round-trip).
  isSignedIn = async (): Promise<boolean> => isAntigravitySignedIn(this.store.read());
}
