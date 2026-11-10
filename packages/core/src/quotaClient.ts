import { parseAccountQuota, type QuotaProvider } from './quota';
import type { QuotaMeter } from './status';

export type QuotaFetchResult = { ok: true; meters: QuotaMeter[] } | {
  ok: false; code: 'auth' | 'rate_limited' | 'unavailable' | 'invalid_response'; retryAfterMs?: number;
};

const retryAfter = (raw: string | null, now: number): number | undefined => {
  if (!raw?.trim()) return undefined;
  const value = raw.trim();
  const ms = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(value) ? Date.parse(value) - now : NaN;
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
};
const credential = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !/[\r\n]/.test(value);

// The caller owns timeout/cancellation and refresh cadence. This boundary makes exactly one usage call.
export const fetchAccountQuota = async (
  provider: QuotaProvider,
  creds: { accessToken: string; accountId?: string },
  options: { signal: AbortSignal; now: number; request?: typeof fetch },
): Promise<QuotaFetchResult> => {
  if (provider !== 'anthropic' && provider !== 'codex') return { ok: false, code: 'unavailable' };
  if (!credential(creds.accessToken) || (provider === 'codex' && !credential(creds.accountId))) return { ok: false, code: 'auth' };
  let response: Response | undefined;
  try {
    options.signal.throwIfAborted();
    const headers = new Headers({ Authorization: `Bearer ${creds.accessToken}` });
    if (provider === 'anthropic') headers.set('anthropic-beta', 'oauth-2025-04-20');
    else headers.set('chatgpt-account-id', creds.accountId!);
    response = await (options.request ?? fetch)(provider === 'anthropic'
      ? 'https://api.anthropic.com/api/oauth/usage' : 'https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET', headers, signal: options.signal, redirect: 'manual',
    });
    if (!response.ok || response.redirected) {
      // Cancellation must not erase a server deadline already received in the response head.
      const retryAfterMs = retryAfter(response.headers.get('retry-after'), options.now);
      return {
        ok: false,
        code: response.status === 401 || response.status === 403 ? 'auth'
          : response.status === 429 ? 'rate_limited' : 'unavailable',
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    options.signal.throwIfAborted();
    const payload: unknown = await response.json().catch(() => undefined);
    options.signal.throwIfAborted();
    const meters = parseAccountQuota(provider, payload);
    return meters.length ? { ok: true, meters } : { ok: false, code: 'invalid_response' };
  } catch {
    // Never expose a response, exception, URL or headers containing account data.
    return { ok: false, code: 'unavailable' };
  } finally {
    await response?.body?.cancel().catch(() => {});
  }
};
