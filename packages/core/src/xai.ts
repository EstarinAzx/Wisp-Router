// ---------------- xai.ts — Wisp: Grok (xAI) Provider pure cores (creds, endpoint guards, Responses request) ---------------- //

/*
 * Depends on:
 *   - ./shared — the provider kernel: ModelCaps, ModelsDevCatalog + sortByReleaseDesc, the effort ladder
 *     (CodexReasoning/EffortLevel/standardEffortToCodex/DEFAULT_EFFORT), and trimmedString.
 *   - ./catalog — the Provider row type ONLY (import type, erased at runtime), so catalog -> xai is the sole
 *     runtime edge and the graph stays acyclic.
 *   - the Web URL global — the isXaiEndpoint host guard.
 *
 * Data shapes:
 *   - XaiCreds: the xAI-OAuth credential bundle (access/refresh token, absolute expiresAt, cached OIDC endpoint).
 */

import type { Provider } from './catalog';
import {
  sortByReleaseDesc, standardEffortToCodex, DEFAULT_EFFORT, trimmedString,
  type ModelCaps, type ModelsDevCatalog, type CodexReasoning, type EffortLevel,
} from './shared';

// ----------------------------- Grok (xAI OAuth) Provider (pure cores) ----------------------------- //

// Grok's credential bundle — a Codex-twin reached by xAI OAuth (no API key). Like Anthropic the token
// carries no JWT exp (xAI returns expires_in), so the deadline is stored as an absolute epoch-ms
// expiresAt. tokenEndpoint caches the once-discovered OIDC token endpoint (D7) so a refresh needn't
// re-run discovery. The impure xaiAuth.ts owns the OAuth/IO.
export type XaiCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;     // epoch ms; absent when the token response carried no expires_in
  tokenEndpoint?: string; // discovered OIDC token endpoint, cached across refreshes (D7)
};

// Whether a catalog row is the Grok backend. Absent kind == 'openai-chat', so false for the API-key rows —
// including the Groq row Grok must never be confused with — and Codex/Anthropic.
export const isXaiProvider = (provider: Provider): boolean => provider.kind === 'xai-oauth';

// Grok is "usable when signed in" — no API key, so usability is a bearer access token. The `{}` sign-out
// tombstone and a refresh-only blob both read as signed-out.
export const isXaiSignedIn = (creds: XaiCreds | undefined): boolean =>
  !!creds && !!creds.accessToken;

// Turn an xAI OAuth token response into XaiCreds. expires_in (seconds, relative) becomes an absolute
// expiresAt against the injected clock — `now` is a parameter so this stays pure.
export const tokensToXaiCreds = (
  payload: { access_token?: string; refresh_token?: string; expires_in?: number },
  now: number,
): XaiCreds => ({
  ...(payload.access_token ? { accessToken: payload.access_token } : {}),
  ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
  ...(typeof payload.expires_in === 'number' ? { expiresAt: now + payload.expires_in * 1000 } : {}),
});

// Refresh 2 minutes BEFORE expiry (xAI's skew — tighter than Anthropic's 5min). No expiresAt → false:
// can't prove staleness. The skew lives HERE at the check (the twin pattern), not baked into expiresAt —
// so it is applied exactly once.
const XAI_TOKEN_REFRESH_SKEW_MS = 2 * 60_000;
export const shouldRefreshXaiToken = (creds: { expiresAt?: number }, now: number): boolean =>
  creds.expiresAt !== undefined && creds.expiresAt <= now + XAI_TOKEN_REFRESH_SKEW_MS;

// Parse a stored auth.json slice into XaiCreds. An absent/empty/corrupt slot reads as undefined; the `{}`
// tombstone parses to an empty object (isXaiSignedIn then reads signed-out).
export const parseXaiCreds = (raw: string | undefined): XaiCreds | undefined => {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as XaiCreds; } catch { return undefined; }
};

// Curated Grok model ids — the OFFLINE FALLBACK for xaiModelsFrom and the OAuth-only lineup. The xai row's
// defaultModel (grok-build) must stay a member.
export const XAI_MODELS: string[] = ['grok-build', 'grok-composer-2.5-fast', 'grok-4.5'];

// Live Grok dropdown ids from models.dev — undated aliases only. No family whitelist: a brand-new Grok id
// must appear, never be filtered out. Catalog absent/filter-empty → curated fallback.
export const xaiModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.xai?.models;
  if (!models) return XAI_MODELS;
  const ids = Object.keys(models).filter((id) => !/-\d{8}$/.test(id));
  return ids.length ? sortByReleaseDesc(models, ids) : XAI_MODELS;
};

// Real Grok model windows — the OAuth path has no models.dev catalogKey, so without this the picker shows
// the neutral default. grok-build (512K/30K) + grok-composer (200K/30K) route the proxy; grok-4.5 is
// 500K/131K reasoning on api.x.ai. maxOutput is pinned present so the client slice reads it as max_tokens
// without a fallback — mirrors anthropicModelCaps.
export const xaiModelCaps = (model: string): ModelCaps & { maxOutput: number } => {
  const m = model.toLowerCase();
  if (m.includes('composer')) return { contextInput: 200_000, maxOutput: 30_000 };
  if (/grok-[4-9]/.test(m)) return { contextInput: 500_000, maxOutput: 131_000 }; // grok-4.5+ reasoning family
  return { contextInput: 512_000, maxOutput: 30_000 }; // grok-build (default)
};

// Grok CLI's expires_at is an absolute deadline — epoch SECONDS in some builds, MS in others. Normalize to
// ms by magnitude (~1e9 s vs ~1e12 ms); a wrong guess only forces one self-healing refresh.
const grokExpiresAtMs = (raw: unknown): number | undefined =>
  typeof raw === 'number' && isFinite(raw) ? (raw < 1e12 ? raw * 1000 : raw) : undefined;

// Import an existing Grok CLI login (~/.grok/auth.json) so a CLI user isn't forced to sign in again (D6 —
// parity with parseCodexAuthJson). The CLI nests the bundle under an "https://auth.x.ai::<client_id>" key
// ({ key, refresh_token, expires_at }); a flatter legacy shape stores it at the root. `key` is the bearer.
// undefined when there is no usable bearer — never throws.
export const parseGrokAuthJson = (json: unknown): XaiCreds | undefined => {
  if (!json || typeof json !== 'object') return undefined;
  const root = json as Record<string, any>;
  const nestedKey = Object.keys(root).find((k) => k.startsWith('https://auth.x.ai::'));
  const slot = (nestedKey ? root[nestedKey] : root) as Record<string, any>;
  if (!slot || typeof slot !== 'object') return undefined;
  const accessToken = trimmedString(slot.key ?? slot.access_token);
  const refreshToken = trimmedString(slot.refresh_token);
  const expiresAt = grokExpiresAtMs(slot.expires_at);
  if (!accessToken) return undefined;
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
};

// A discovered OIDC endpoint is trusted only when its host is x.ai (or a subdomain) — the leading-dot
// guard blocks look-alikes (evilx.ai, x.ai.evil.com); anything unparseable is rejected. Both endpoints
// from the well-known doc pass through this before the bearer is ever sent (D7 security check).
export const isXaiEndpoint = (url: string): boolean => {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'x.ai' || h.endsWith('.x.ai'); }
  catch { return false; }
};

// ----------------------------- Grok (xAI) Responses request (pure cores) ----------------------------- //

// The public direct endpoint (grok-4.5+); proxy models use the catalog row's baseUrl instead.
const XAI_PUBLIC_RESPONSES_URL = 'https://api.x.ai/v1/responses';
// Grok-CLI client identity the subscription proxy expects. ⚠️ Best-effort values — structurally required
// but the exact identifier/version await a live check (#97/#98).
const XAI_CLIENT_IDENTIFIER = 'grok-cli';
const XAI_CLIENT_VERSION = '1.0.0';

// grok-build + grok-composer are the subscription models served by the Grok-CLI proxy; grok-4.5+ go direct
// to api.x.ai. Drives both the endpoint and whether the x-grok-* proxy headers ride.
export const isGrokCliProxyModel = (model: string): boolean => {
  const m = model.toLowerCase();
  return m.startsWith('grok-build') || m.includes('composer');
};

// The Responses endpoint for a model: the row's proxy base + /responses for subscription models, else the
// public api.x.ai.
export const xaiResponsesUrl = (baseUrl: string, model: string): string =>
  isGrokCliProxyModel(model) ? `${baseUrl}/responses` : XAI_PUBLIC_RESPONSES_URL;

// Request headers. Bearer always; proxy models add the x-grok-* CLI-identifying set the subscription proxy
// validates. x-grok-conv-id keys the proxy's cache — one per stream.
export const xaiRequestHeaders = (model: string, bearer: string, sessionId: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${bearer}`,
  };
  if (isGrokCliProxyModel(model)) {
    headers['x-grok-client-identifier'] = XAI_CLIENT_IDENTIFIER;
    headers['x-grok-client-version'] = XAI_CLIENT_VERSION;
    headers['x-xai-token-auth'] = 'xai-grok-cli';
    headers['x-grok-model-override'] = model;
    headers['x-grok-conv-id'] = sessionId;
  }
  return headers;
};

// Per-model reasoning gate: grok-4.5+ are reasoning models (take a reasoning block, same shape as Codex);
// grok-build/composer reject it. Effort folds 'max'→'xhigh' (xAI's wire tops there, like Codex).
export const xaiReasoning = (model: string, effort?: EffortLevel): CodexReasoning | undefined =>
  /grok-[4-9]/.test(model.toLowerCase())
    ? { effort: standardEffortToCodex(effort ?? DEFAULT_EFFORT), summary: 'auto' }
    : undefined;

// Sanitize a RAW external Responses payload for xAI — the path where the Bridge forwards a client's
// payload verbatim, NOT our own buildCodexResponsesBody output. xAI 400s on three OpenAI-Responses quirks:
// prompt_cache_retention (unsupported), the reasoning.encrypted_content `include` entry on the proxy, and
// the 'minimal' effort level (fold to 'low'). Pure; returns a new object.
export const rewriteXaiResponsesPayload = (payload: Record<string, unknown>, opts: { proxy: boolean }): Record<string, unknown> => {
  const body = { ...payload };
  delete body.prompt_cache_retention;
  if (opts.proxy && Array.isArray(body.include)) {
    const include = (body.include as unknown[]).filter((x) => x !== 'reasoning.encrypted_content');
    if (include.length) body.include = include; else delete body.include;
  }
  const reasoning = body.reasoning;
  if (reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning) && (reasoning as Record<string, unknown>).effort === 'minimal') {
    body.reasoning = { ...(reasoning as Record<string, unknown>), effort: 'low' };
  }
  return body;
};
