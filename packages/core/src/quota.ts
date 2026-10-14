import { quotaWindowLabel, QUOTA_LEDGER_MAX_AGE_MS, type QuotaMeter, type WispStatus } from './status';

export type QuotaProvider = 'anthropic' | 'codex';
export type QuotaReading = { updatedAt: number; authRevision: string; meters: QuotaMeter[] };
export type QuotaCache = { schema: 1; providers: Partial<Record<QuotaProvider, {
  reading?: QuotaReading; nextAllowedAt: number;
}>> };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const epochSeconds = (value: unknown): number | undefined =>
  finite(value) && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e12 ? value : undefined;

const epochMs = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;

// Cache input is untrusted too. Project fields rather than carrying arbitrary account data forward.
export const parseQuotaCache = (raw: unknown): QuotaCache => {
  const cache: QuotaCache = { schema: 1, providers: {} };
  if (!record(raw) || raw.schema !== 1 || !record(raw.providers)) return cache;
  for (const provider of ['anthropic', 'codex'] as const) {
    const entry = raw.providers[provider];
    if (!record(entry)) continue;
    const clean = cache.providers[provider] = { nextAllowedAt: epochMs(entry.nextAllowedAt) ? entry.nextAllowedAt : 0 } as NonNullable<QuotaCache['providers'][QuotaProvider]>;
    const reading = entry.reading;
    if (!record(reading) || !epochMs(reading.updatedAt) || typeof reading.authRevision !== 'string'
      || !/^v1:\d+:\d+:\d+:\d+:\d+$/.test(reading.authRevision)
      || !Array.isArray(reading.meters) || !reading.meters.length) continue;
    const meters: QuotaMeter[] = [];
    const labels = new Set<string>();
    for (const meter of reading.meters) {
      if (!record(meter) || typeof meter.label !== 'string' || meter.label.length > 32
        || !/^\d+(?:\.\d+)?[mhd]$/.test(meter.label) || !(Number(meter.label.slice(0, -1)) > 0)
        || labels.has(meter.label) || !finite(meter.percent) || meter.percent < 0 || meter.percent > 100
        || (meter.resetAt !== undefined && epochSeconds(meter.resetAt) === undefined)) break;
      labels.add(meter.label);
      meters.push({ label: meter.label, percent: meter.percent,
        ...(meter.resetAt === undefined ? {} : { resetAt: meter.resetAt as number }) });
    }
    if (meters.length === reading.meters.length) clean.reading = {
      updatedAt: reading.updatedAt, authRevision: reading.authRevision, meters,
    };
  }
  return cache;
};

// Each observation stands alone. Reuse the cache validator for passive/legacy on-disk snapshots too.
export const selectQuotaReading = (
  provider: QuotaProvider, cache: QuotaCache, status: WispStatus | undefined,
  authRevision: string | undefined, now: number,
): { reading: QuotaReading; source: 'refresh' | 'headers' } | undefined => {
  if (!authRevision || !/^v1:\d+:\d+:\d+:\d+:\d+$/.test(authRevision) || !epochMs(now)) return undefined;
  let selected: ReturnType<typeof selectQuotaReading>;
  const candidates = [
    { source: 'refresh' as const, reading: cache?.schema === 1 ? cache.providers?.[provider]?.reading : undefined },
    { source: 'headers' as const, reading: status?.providers?.[provider] },
    { source: 'headers' as const, reading: status?.providerId === provider ? status : undefined },
  ];
  for (const candidate of candidates) {
    const reading = parseQuotaCache({ schema: 1, providers: { [provider]: { reading: candidate.reading } } }).providers[provider]?.reading;
    if (!reading || reading.authRevision !== authRevision || now < reading.updatedAt
      || now - reading.updatedAt > QUOTA_LEDGER_MAX_AGE_MS) continue;
    if (!selected || reading.updatedAt >= selected.reading.updatedAt) selected = { reading, source: candidate.source };
  }
  return selected;
};

const isoSeconds = (value: unknown): number | undefined => {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  // Date.parse rolls February 30 forward; an invalid reset must not look authoritative.
  if (!Number.isFinite(parsed) || !Number.isFinite(day)
    || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) return undefined;
  return epochSeconds(Math.floor(parsed / 1000));
};

export const parseAccountQuota = (provider: QuotaProvider, payload: unknown): QuotaMeter[] => {
  if (!record(payload)) return [];
  const rows: unknown[] = provider === 'anthropic' && Array.isArray(payload.limits) ? payload.limits
    : provider === 'codex' && record(payload.rate_limit)
      ? [payload.rate_limit.primary_window, payload.rate_limit.secondary_window] : [];
  const windows = new Map<string, { minutes: number; meter: QuotaMeter } | undefined>();
  for (const row of rows) {
    if (!record(row)) continue;
    let minutes: number | undefined;
    let percent: unknown;
    let reset: unknown;
    let resetAt: number | undefined;
    if (provider === 'anthropic') {
      // Witnessed kind/group pairs: https://github.com/getpaseo/paseo/issues/2302.
      // ponytail: account-wide windows only; add explicit scope identity before exposing scoped limits.
      if (row.scope !== null) continue;
      minutes = row.kind === 'session' && row.group === 'session' ? 300
        : row.kind === 'weekly_all' && row.group === 'weekly' ? 10080 : undefined;
      percent = row.percent;
      reset = row.resets_at;
      resetAt = isoSeconds(reset);
    } else {
      minutes = finite(row.limit_window_seconds) ? row.limit_window_seconds / 60 : undefined;
      percent = row.used_percent;
      reset = row.reset_at;
      resetAt = epochSeconds(reset);
    }
    const label = minutes === undefined ? undefined : quotaWindowLabel(minutes);
    if (!label || !finite(percent) || percent < 0 || percent > 100 || (reset != null && resetAt === undefined)) continue;
    // A duplicate (including two durations rounding to one label) is ambiguous, not first/last wins.
    windows.set(label, windows.has(label) ? undefined : {
      minutes: minutes!, meter: { label, percent, ...(resetAt === undefined ? {} : { resetAt }) },
    });
  }
  return [...windows.values()].filter((entry): entry is { minutes: number; meter: QuotaMeter } => entry !== undefined)
    .sort((a, b) => a.minutes - b.minutes).map(entry => entry.meter);
};
