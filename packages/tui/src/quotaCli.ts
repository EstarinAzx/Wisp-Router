import { fetchAccountQuota, selectQuotaReading, QuotaRefreshBusyError, type QuotaCache, type QuotaProvider, type WispHome, type WispStatus } from '@wisp/core';
import { home, quotaCurrent } from './store';

export type QuotaCommandDeps = {
  home: WispHome;
  current(provider: QuotaProvider): Promise<{ accessToken: string; accountId?: string } | undefined>;
  now(): number;
  fetch: typeof fetchAccountQuota;
  signal?: AbortSignal;
};

const providers: QuotaProvider[] = ['anthropic', 'codex'];
const errors = {
  auth: 'sign-in required; sign in to this Provider in Wisp.',
  rate_limited: 'rate limited; wait before refreshing again.',
  unavailable: 'quota is unavailable; the last successful reading is retained.',
  invalid_response: 'quota response was not recognized; the last successful reading is retained.',
};

const display = (cache: QuotaCache, status: WispStatus | undefined, revision: string | undefined, now: number): string[] => providers.flatMap(provider => {
  const selected = selectQuotaReading(provider, cache, status, revision, now);
  if (!selected) {
    return [`${provider}: unavailable. Use quota refresh to update.`];
  }
  const { reading, source } = selected;
  return [`${provider}: updated ${Math.floor((now - reading.updatedAt) / 1000)}s ago (${source}).`, ...reading.meters.map(meter =>
    `  ${meter.label}: ${meter.percent}%${meter.resetAt === undefined ? '' : `; resets ${new Date(meter.resetAt * 1000).toISOString()}`}`)];
});

export const runQuota = async (args: string[], deps?: QuotaCommandDeps): Promise<{ exitCode: number; lines: string[] }> => {
  if (args.length && (args[0] !== 'refresh' || args.length > 2 || (args[1] !== undefined && !providers.includes(args[1] as QuotaProvider)))) {
    return { exitCode: 1, lines: ['Usage: wisp quota [refresh [anthropic|codex]]', 'TUI: /quota [refresh [anthropic|codex]]'] };
  }
  const d = deps ?? { home, current: quotaCurrent, now: Date.now, fetch: fetchAccountQuota };
  try {
    if (!args.length) return { exitCode: 0, lines: display(d.home.readQuota(), d.home.readStatus(), d.home.quotaAuthRevision(), d.now()) };
    if (d.signal?.aborted) return { exitCode: 1, lines: ['Quota refresh cancelled.'] };
    return await d.home.withQuotaRefreshLock(async () => {
      const cache = d.home.readQuota();
      const lines: string[] = [];
      let exitCode = 0;
      const selected = args[1] ? [args[1] as QuotaProvider] : providers.filter(provider => d.home.readAuth()[provider]?.accessToken?.trim());
      if (!selected.length) return { exitCode: 1, lines: ['Quota refresh requires a supported Provider sign-in in Wisp.'] };
      for (const provider of selected) {
        if (d.signal?.aborted) { exitCode = 1; lines.push('Quota refresh cancelled.'); break; }
        if (!d.home.readAuth()[provider]?.accessToken?.trim()) {
          exitCode = 1; lines.push(`${provider}: ${errors.auth}`); continue;
        }
        const started = d.now();
        const entry = cache.providers[provider] ?? { nextAllowedAt: 0 };
        if (started < entry.nextAllowedAt) {
          lines.push(`${provider}: refresh available in ${Math.ceil((entry.nextAllowedAt - started) / 1000)}s.`); continue;
        }
        entry.nextAllowedAt = started + 300000;
        cache.providers[provider] = entry;
        // Must reach disk before any outbound work, including ordinary token renewal.
        d.home.writeQuota(cache);
        try {
          const creds = await d.current(provider);
          const revision = d.home.quotaAuthRevision();
          const stored = d.home.readAuth()[provider];
          if (!creds?.accessToken) { exitCode = 1; lines.push(`${provider}: ${errors.auth}`); continue; }
          // Renewal may write a new revision. A different returned/stored bearer cannot be relabeled
          // with that revision (sign-out/account change or failed credential persistence during await).
          if (!revision || stored?.accessToken !== creds.accessToken
            || (provider === 'codex' && (stored as { accountId?: string })?.accountId !== creds.accountId)) {
            exitCode = 1; lines.push(`${provider}: credentials changed or unavailable; quota result discarded.`); continue;
          }
          if (d.signal?.aborted) { exitCode = 1; lines.push('Quota refresh cancelled.'); break; }
          const timeout = AbortSignal.timeout(10000);
          const signal = d.signal ? AbortSignal.any([d.signal, timeout]) : timeout;
          const result = await d.fetch(provider, creds, { signal, now: d.now() });
          const finished = d.now();
          // A received Retry-After survives cancellation AND credential changes.
          if (!result.ok && result.retryAfterMs !== undefined) entry.nextAllowedAt = Math.max(entry.nextAllowedAt,
            Math.min(8.64e15, Math.ceil(finished + result.retryAfterMs)));
          if (d.home.quotaAuthRevision() !== revision) {
            exitCode = 1; lines.push(`${provider}: credentials changed; quota result discarded.`);
          } else if (signal.aborted) {
            exitCode = 1; lines.push(`${provider}: quota refresh cancelled or timed out.`);
          } else if (result.ok) {
            entry.reading = { updatedAt: finished, authRevision: revision, meters: result.meters };
            lines.push(`${provider}: quota refreshed.`);
          } else { exitCode = 1; lines.push(`${provider}: ${errors[result.code]}`); }
        } catch {
          exitCode = 1; lines.push(`${provider}: ${errors.unavailable}`);
        } finally {
          const revision = d.home.quotaAuthRevision();
          for (const provider of providers) {
            const cached = cache.providers[provider];
            if (cached?.reading && cached.reading.authRevision !== revision) delete cached.reading;
          }
          d.home.writeQuota(cache);
        }
      }
      return { exitCode, lines: [...lines, ...display(cache, d.home.readStatus(), d.home.quotaAuthRevision(), d.now())] };
    });
  } catch (error) {
    return { exitCode: 1, lines: [error instanceof QuotaRefreshBusyError ? 'Quota refresh is busy.' : 'Could not read or save quota cache.'] };
  }
};
