// ----------------- kimiAuth.ts — Wisp: Kimi device-flow sign-in + token store ----------------- //

/*
 * Depends on:
 *   - injected store accessors: the kimi slice of ~/.wisp/auth.json (ADR-0002) — each face wires them to its
 *     WispHome, so this module never touches the fs layout itself. auth.json is owner-only at that layer.
 *   - ./catalog: the pure cores (KimiCreds, parseDeviceAuthorization, classifyDevicePoll, nextPollIntervalMs,
 *     tokensToKimiCreds, shouldRefreshKimiToken, isKimiSignedIn).
 *
 * Data shapes:
 *   - KimiCreds (from ./catalog): { accessToken?, refreshToken?, expiresAt? } — the stored bundle. The access
 *     token is the bearer the ORDINARY OpenAI-chat path sends, so no bespoke client exists for this Provider.
 *   - KimiCredsStore: { read, write } over that bundle — read undefined = never signed in (distinct from the
 *     {} sign-out tombstone).
 *
 * Flow: RFC 8628 device authorization — SIMPLER than the three browser Providers because the user authorizes
 * out of band. No loopback redirect catcher and no PKCE: request a device code, hand the user a URL and a
 * short code, then poll the token endpoint at the server's stated interval until it says yes, no, or too late.
 *
 * Nothing here ever logs a token: log lines carry HTTP statuses and outcome kinds only, and the pure
 * classifier builds its messages from the server's error fields alone.
 */

import { AuthStateChangedError } from './homeStore';
import {
  type KimiCreds, type KimiDeviceAuthorization, type KimiPollOutcome,
  parseDeviceAuthorization, classifyDevicePoll, nextPollIntervalMs,
  tokensToKimiCreds, shouldRefreshKimiToken, isKimiSignedIn,
} from './catalog';

// ----------------------------- Constants ----------------------------- //

// The Kimi Code OAuth app — public values (a native-app client id is not a secret). ⚠ Best-effort: taken from
// the CLIProxyAPI implementation via #170 and NOT re-verified live (the referenced source path 404s and an
// unattended agent should not be minting device codes against a third party). A wrong host fails loud at
// sign-in with the server's own words; nothing silently degrades.
const KIMI_AUTH_HOST = 'https://auth.kimi.com';
const KIMI_DEVICE_ENDPOINT = `${KIMI_AUTH_HOST}/api/oauth/device_authorization`;
const KIMI_TOKEN_ENDPOINT = `${KIMI_AUTH_HOST}/api/oauth/token`;
const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';
// RFC 8628's grant type for the poll leg.
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

const REQUEST_TIMEOUT_MS = 15_000;

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Kimi sign-in cancelled.')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new Error('Kimi sign-in cancelled.')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// Read a response body as JSON without throwing — the classifier handles an unshaped body as `failed`, so a
// non-JSON error page must reach it as data rather than blowing up the poll loop.
const jsonBody = async (res: Response): Promise<unknown> => {
  const text = await res.text().catch(() => '');
  try { return JSON.parse(text) as unknown; } catch { return text; }
};

// ----------------------------- Device authorization + poll ----------------------------- //

// First leg (§3.1/§3.2): ask for a device code. Form-encoded, like every other token-endpoint call in this
// codebase.
const requestDeviceAuthorization = async (now: number): Promise<KimiDeviceAuthorization> => {
  const res = await fetch(KIMI_DEVICE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: KIMI_CLIENT_ID }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Kimi device authorization failed (${res.status}).`);
  const parsed = parseDeviceAuthorization(await jsonBody(res), now);
  if (!parsed) throw new Error('Kimi device authorization returned no device code.');
  return parsed;
};

// One poll of the token endpoint (§3.4). The device code is a secret — it rides the body and is never logged.
// The caller's cancel signal is COMBINED with the per-request timeout rather than replacing it: the window
// check only runs between polls, so a hung request with no timeout would park the flow forever.
const pollOnce = async (deviceCode: string, now: number, signal?: AbortSignal): Promise<KimiPollOutcome> => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(KIMI_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: DEVICE_CODE_GRANT, device_code: deviceCode, client_id: KIMI_CLIENT_ID }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  return classifyDevicePoll(res.status, await jsonBody(res), now);
};

// ----------------------------- KimiAuth — store + device flow + refresh ----------------------------- //

// The kimi slice of ~/.wisp/auth.json, as the host face exposes it. read() undefined = the field has NEVER
// been written; the {} tombstone means signed out. (No CLI auth.json import exists for Kimi, so unlike the
// Codex/Grok managers the two states behave the same — the distinction is kept for store symmetry.)
export type KimiCredsStore = {
  read: () => KimiCreds | undefined;
  // A supplied snapshot must be compared under the host's auth write lock.
  write: (creds: KimiCreds, expected?: string) => void;
};

// What the face shows the user while the device flow waits: where to go and what to type.
export type KimiDevicePrompt = {
  verificationUri: string;
  verificationUriComplete?: string;
  userCode: string;
  expiresAt: number;
};

// Owns the Kimi token lifecycle against one auth.json slice. Each face holds a single instance and drives
// sign-in/out + its kimi bearer resolution through it.
export class KimiAuth {
  constructor(
    private readonly store: KimiCredsStore,
    private readonly log: (message: string) => void,
  ) {}

  // Run the device flow to completion. `onPrompt` is called ONCE, as soon as there is something for the user
  // to act on — the face renders the URL + code from it and the poll runs behind that screen. Polling honours
  // the server's interval, backs off 5s on every slow_down, and gives up when the authorization window closes.
  signIn = async (onPrompt: (prompt: KimiDevicePrompt) => void, signal?: AbortSignal): Promise<KimiCreds> => {
    const auth = await requestDeviceAuthorization(Date.now());
    onPrompt({
      verificationUri: auth.verificationUri,
      ...(auth.verificationUriComplete ? { verificationUriComplete: auth.verificationUriComplete } : {}),
      userCode: auth.userCode,
      expiresAt: auth.expiresAt,
    });
    let interval = auth.intervalMs;
    for (;;) {
      await sleep(interval, signal);
      // The window is the hard stop: a server that keeps answering authorization_pending must not poll forever.
      if (Date.now() >= auth.expiresAt) throw new Error('Kimi sign-in expired before it was approved.');
      const outcome = await pollOnce(auth.deviceCode, Date.now(), signal);
      if (outcome.kind === 'authorized') {
        this.store.write(outcome.creds);
        return outcome.creds;
      }
      if (outcome.kind === 'pending') continue;
      if (outcome.kind === 'slow-down') {
        interval = nextPollIntervalMs(interval, outcome);
        this.log(`[kimi] server asked to slow down — polling every ${Math.round(interval / 1000)}s (#170)`);
        continue;
      }
      throw new Error(outcome.message);
    }
  };

  // Sign out by writing an empty TOMBSTONE rather than deleting the field, mirroring the other managers — a
  // present-but-bearer-less blob reads as "signed out" and the stored credentials are gone.
  signOut = (): void => this.store.write({});

  // The refresh currently on the wire, if any. bearer() sits on each face's per-Provider key seam, which a
  // single Bridge request walks once PER ROW — so without coalescing, several callers would each fire the
  // SINGLE-USE refresh token and all but one would come back invalid_grant. The store re-read below only
  // guards the other process; this guards this one.
  private refreshInFlight: Promise<KimiCreds> | undefined;

  // Refresh the access token when it is inside the 5-minute skew window, persisting the new bundle. Two
  // processes share auth.json (extension + TUI), so RE-READ before refreshing: if the other already rotated
  // the token, use its bundle instead of firing our stale (single-use) refresh token. A failed refresh is
  // non-fatal — keep the existing creds and let the live call surface a 401.
  private refreshIfNeeded = async (creds: KimiCreds): Promise<KimiCreds> => {
    if (!creds.refreshToken || !shouldRefreshKimiToken(creds, Date.now())) return creds;
    this.refreshInFlight ??= this.runRefresh().finally(() => { this.refreshInFlight = undefined; });
    return this.refreshInFlight;
  };

  private runRefresh = async (): Promise<KimiCreds> => {
    const fresh = this.store.read();
    if (!fresh) throw new AuthStateChangedError();
    if (!shouldRefreshKimiToken(fresh, Date.now()) || !fresh.refreshToken) return fresh;
    const beforeRefresh = JSON.stringify(fresh);
    let next: KimiCreds;
    try {
      const res = await fetch(KIMI_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: KIMI_CLIENT_ID, grant_type: 'refresh_token', refresh_token: fresh.refreshToken }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) { this.log(`[kimi] token refresh failed (${res.status})`); return fresh; }
      next = tokensToKimiCreds(await res.json() as { access_token?: string }, Date.now());
      if (!next.accessToken) { this.log('[kimi] token refresh returned no access token'); return fresh; }
      // The refresh response may omit a fresh refresh_token — keep the old one so the next refresh works.
      if (!next.refreshToken) next.refreshToken = fresh.refreshToken;
    } catch (err) {
      this.log(`[kimi] token refresh error: ${String(err)}`);
      return fresh;
    } finally {
      // Failed grants must not hand a signed-out or replaced account back to the caller either.
      if (JSON.stringify(this.store.read()) !== beforeRefresh) throw new AuthStateChangedError();
    }
    // Persist OUTSIDE the fetch catch: the rotation already happened server-side, so a failed auth.json write
    // must not discard the new bundle — keep using it in memory and let a later write retry.
    try { this.store.write(next, beforeRefresh); } catch (err) {
      if (err instanceof AuthStateChangedError) throw err;
      if (JSON.stringify(this.store.read()) !== beforeRefresh) throw new AuthStateChangedError();
      this.log(`[kimi] token persist error: ${String(err)}`);
    }
    return next;
  };

  // The credentials to use right now, refreshed if near expiry. undefined = not signed in.
  current = async (): Promise<KimiCreds | undefined> => {
    const creds = this.store.read();
    return creds ? this.refreshIfNeeded(creds) : undefined;
  };

  // Cheap signed-in check for UI/usability — read-only (no refresh round-trip).
  isSignedIn = (): boolean => isKimiSignedIn(this.store.read());

  // The bearer the OpenAI-chat path sends for Kimi, refreshed if near expiry. '' = not signed in, which is
  // exactly what each face's keyFor answers for an unkeyed row — so the keyed executor and the picker's
  // usability check both read Kimi correctly with no new branch.
  bearer = async (): Promise<string> => (await this.current())?.accessToken ?? '';
}
