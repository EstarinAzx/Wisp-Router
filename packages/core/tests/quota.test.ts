import { describe, expect, it } from 'vitest';
import { parseAccountQuota, parseQuotaCache, selectQuotaReading, type QuotaCache, type WispStatus } from '../src/index';

describe('selectQuotaReading', () => {
  const revision = 'v1:1:2:3:4:5';
  const cache: QuotaCache = { schema: 1, providers: { codex: { nextAllowedAt: 999999,
    reading: { updatedAt: 200, authRevision: revision, meters: [{ label: '5h', percent: 42 }] },
  } } };
  const status: WispStatus = { updatedAt: 100, providerId: 'codex', model: 'fixture', authRevision: revision,
    contextPercent: 17, contextTokens: 1700, contextWindow: 10000, meters: [{ label: '7d', percent: 71 }] };

  it('chooses the freshest whole reading, prefers headers on ties and leaves conversation state unchanged', () => {
    const before = JSON.stringify({ cache, status });
    expect(selectQuotaReading('codex', cache, status, revision, 1000)).toEqual({ source: 'refresh', reading: cache.providers.codex!.reading });
    for (const updatedAt of [200, 300]) expect(selectQuotaReading('codex', cache, { ...status, updatedAt }, revision, 1000))
      .toEqual({ source: 'headers', reading: { updatedAt, authRevision: revision, meters: [{ label: '7d', percent: 71 }] } });
    expect(JSON.stringify({ cache, status })).toBe(before);
  });

  it('selects remembered headers even when the active Provider has no meters', () => {
    const remembered = { updatedAt: 400, model: 'older-model', authRevision: revision, meters: [{ label: '7d', percent: 12 }] };
    for (const providerId of ['anthropic', 'codex']) {
      expect(selectQuotaReading('codex', cache, { ...status, providerId, meters: undefined, providers: { codex: remembered } }, revision, 1000))
        .toEqual({ source: 'headers', reading: { updatedAt: 400, authRevision: revision, meters: remembered.meters } });
    }
  });

  it('rejects unknown, invalid and changed bindings for active, remembered and refreshed readings', () => {
    const withLedger = { ...status, providers: { codex: { ...status, updatedAt: 400 } } };
    for (const current of [undefined, '', 'unbound', 'v1:1:2:3:4:6'])
      expect(selectQuotaReading('codex', cache, withLedger, current, 1000)).toBeUndefined();
    expect(selectQuotaReading('codex', { schema: 1, providers: {} }, { ...status, authRevision: undefined }, revision, 1000)).toBeUndefined();
  });

  it('rejects future, stale and malformed whole readings, with a 24-hour inclusive boundary', () => {
    const empty: QuotaCache = { schema: 1, providers: {} };
    for (const updatedAt of [1001, -1, NaN, Infinity])
      expect(selectQuotaReading('codex', empty, { ...status, updatedAt }, revision, 1000)).toBeUndefined();
    expect(selectQuotaReading('codex', cache, undefined, revision, 200 + 86400000)?.source).toBe('refresh');
    expect(selectQuotaReading('codex', cache, status, revision, 200 + 86400001)).toBeUndefined();
    for (const meters of [[{ label: '5h', percent: 101 }], [{ label: 'PRIVATE', percent: 2 }],
      [{ label: '5h', percent: 42 }, { label: '5h', percent: 71 }]]) {
      expect(selectQuotaReading('codex', empty, { ...status, meters }, revision, 1000)).toBeUndefined();
    }
  });
});

// Synthetic values; kind/group/scope witnessed in #201's follow-up evidence:
// https://github.com/getpaseo/paseo/issues/2302 (not fresh Wisp auth acceptance).
const session = (overrides: Record<string, unknown> = {}) => ({
  kind: 'session', group: 'session', scope: null, percent: 42,
  resets_at: '2033-05-18T03:33:20.123456+00:00', severity: 'normal', is_active: true, ...overrides,
});

describe('parseQuotaCache', () => {
  const reading = { updatedAt: 1000000, authRevision: 'v1:1:2:3:4:5', meters: [{ label: '5h', percent: 42, resetAt: 2000000000 }] };
  const cache = (value: unknown = reading) => ({ schema: 1, providers: { codex: { reading: value, nextAllowedAt: 1300000 } } });

  it('projects only normalized quota fields on read and write', () => {
    expect(parseQuotaCache({ ...cache(), email: 'PRIVATE', providers: {
      codex: { nextAllowedAt: 1300000, token: 'PRIVATE', reading: { ...reading, account: 'PRIVATE',
        meters: [{ ...reading.meters[0], payload: 'PRIVATE' }] } }, other: { account: 'PRIVATE' },
    } })).toEqual(cache());
  });

  it('recovers corrupt or unknown caches without inventing readings', () => {
    for (const raw of [undefined, null, [], 'broken', {}, { schema: 2, providers: {} }, { schema: 1, providers: [] }]) {
      expect(parseQuotaCache(raw)).toEqual({ schema: 1, providers: {} });
    }
    expect(parseQuotaCache({ schema: 1, providers: { codex: { nextAllowedAt: -1 } } }))
      .toEqual({ schema: 1, providers: { codex: { nextAllowedAt: 0 } } });
  });

  it('drops malformed whole readings but preserves their retry deadlines', () => {
    for (const invalid of [null, { ...reading, updatedAt: NaN }, { ...reading, updatedAt: -1 },
      { ...reading, authRevision: 'PRIVATE_ACCOUNT' }, { ...reading, authRevision: '' },
      ...[[], [{ label: 'PRIVATE_LABEL', percent: 42 }], [{ label: '5h', percent: null }],
        [{ label: '5h', percent: 101 }], [{ label: '5h', percent: Infinity }],
        [{ label: '5h', percent: 42, resetAt: '2000000000' }], [reading.meters[0], reading.meters[0]],
      ].map(meters => ({ ...reading, meters })),
    ]) expect(parseQuotaCache(cache(invalid))).toEqual({ schema: 1, providers: { codex: { nextAllowedAt: 1300000 } } });
  });
});
const window = (overrides: Record<string, unknown> = {}) => ({
  used_percent: 42, limit_window_seconds: 18000, reset_after_seconds: 100,
  reset_at: 2000000000, ...overrides,
});

describe('parseAccountQuota', () => {
  it('normalizes witnessed Anthropic account windows without multiplying percentages', () => {
    expect(parseAccountQuota('anthropic', { limits: [
      session({ kind: 'weekly_all', group: 'weekly', percent: 71, resets_at: '2033-05-25T03:33:20Z', is_active: false }),
      session({ percent: 42.25 }),
    ] })).toEqual([
      { label: '5h', percent: 42.25, resetAt: 2000000000 },
      { label: '7d', percent: 71, resetAt: 2000604800 },
    ]);
  });

  it('names Codex windows from seconds, orders by duration and omits an unused window', () => {
    expect(parseAccountQuota('codex', { rate_limit: { primary_window: window(), secondary_window: null } }))
      .toEqual([{ label: '5h', percent: 42, resetAt: 2000000000 }]);
    expect(parseAccountQuota('codex', { rate_limit: {
      primary_window: window({ limit_window_seconds: 604800, used_percent: 100 }),
      secondary_window: window({ used_percent: 0 }),
    } })).toEqual([
      { label: '5h', percent: 0, resetAt: 2000000000 },
      { label: '7d', percent: 100, resetAt: 2000000000 },
    ]);
  });

  it('keeps a real zero and 100 but never coerces missing or invalid percentages', () => {
    for (const percent of [0, 100]) {
      expect(parseAccountQuota('anthropic', { limits: [session({ percent })] })[0]?.percent).toBe(percent);
    }
    for (const percent of [undefined, null, '', '42', false, NaN, Infinity, -1, 100.1]) {
      expect(parseAccountQuota('anthropic', { limits: [session({ percent })] })).toEqual([]);
      expect(parseAccountQuota('codex', { rate_limit: { primary_window: window({ used_percent: percent }) } })).toEqual([]);
    }
  });

  it('does not guess Anthropic kinds, groups, scopes or top-level codenames', () => {
    expect(parseAccountQuota('anthropic', {
      five_hour: { utilization: 42 }, seven_day: { utilization: 71 }, tangelo: { utilization: 42 },
      limits: [
        session({ kind: 'five_hour' }), session({ kind: 'future_kind' }), session({ group: 'weekly' }),
        session({ scope: undefined }), session({ scope: {} }),
        session({ kind: 'weekly_scoped', group: 'weekly', scope: { model: { display_name: 'PRIVATE_MODEL_LABEL' } } }),
        session({ scope: { surface: { display_name: 'PRIVATE_SURFACE_LABEL' } } }),
      ],
    })).toEqual([]);
  });

  it('treats absent or malformed envelopes and unsized Codex windows as unavailable', () => {
    for (const body of [null, undefined, false, 42, [], {}, { limits: {} }, { rate_limit: [] }]) {
      expect(parseAccountQuota('anthropic', body)).toEqual([]);
      expect(parseAccountQuota('codex', body)).toEqual([]);
    }
    expect(parseAccountQuota('codex', { rate_limit: { primary_window: null } })).toEqual([]);
    for (const duration of [undefined, null, '', '18000', 0, -1, NaN, Infinity]) {
      expect(parseAccountQuota('codex', { rate_limit: { primary_window: window({ limit_window_seconds: duration }) } })).toEqual([]);
    }
  });

  it('omits all ambiguous duplicate labels instead of choosing a convenient reading', () => {
    expect(parseAccountQuota('anthropic', { limits: [session(), session({ percent: 12 }),
      session({ kind: 'weekly_all', group: 'weekly', percent: 71 }),
    ] })).toEqual([{ label: '7d', percent: 71, resetAt: 2000000000 }]);
    for (const duration of [18000, 18001]) {
      expect(parseAccountQuota('codex', { rate_limit: {
        primary_window: window(), secondary_window: window({ used_percent: 12, limit_window_seconds: duration }),
      } })).toEqual([]);
    }
  });

  it('keeps missing reset times absent without turning null into epoch zero', () => {
    for (const reset of [undefined, null]) {
      expect(parseAccountQuota('anthropic', { limits: [session({ resets_at: reset })] })).toEqual([{ label: '5h', percent: 42 }]);
      expect(parseAccountQuota('codex', { rate_limit: { primary_window: window({ reset_at: reset }) } }))
        .toEqual([{ label: '5h', percent: 42 }]);
    }
  });

  it('rejects malformed reset times, including calendar rollover and timezone-free dates', () => {
    for (const resets_at of ['', 2000000000, '42', '2033-02-30T03:33:20Z', '2033-05-18',
      '2033-05-18T03:33:20', '2033-05-18T24:00:00Z', '2033-99-18T03:33:20Z', 'not a date']) {
      expect(parseAccountQuota('anthropic', { limits: [session({ resets_at })] })).toEqual([]);
    }
    for (const reset_at of ['', '2000000000', false, -1, NaN, Infinity, 2000000000.5, 9e12]) {
      expect(parseAccountQuota('codex', { rate_limit: { primary_window: window({ reset_at }) } })).toEqual([]);
    }
    expect(parseAccountQuota('anthropic', { limits: [session({ resets_at: '2033-05-18T05:33:20+02:00' })] }))
      .toEqual([{ label: '5h', percent: 42, resetAt: 2000000000 }]);
  });

  it('projects only meter values, never account fields or arbitrary labels', () => {
    const privateFields = { email: 'PRIVATE_EMAIL', account_id: 'PRIVATE_ACCOUNT', user_id: 'PRIVATE_USER', label: 'PRIVATE_LABEL' };
    const results = [
      parseAccountQuota('anthropic', { ...privateFields, limits: [session(privateFields)] }),
      parseAccountQuota('codex', { ...privateFields, rate_limit: { primary_window: window(privateFields) } }),
    ];
    expect(results).toEqual(Array(2).fill([{ label: '5h', percent: 42, resetAt: 2000000000 }]));
    expect(JSON.stringify(results)).not.toContain('PRIVATE_');
  });
});
