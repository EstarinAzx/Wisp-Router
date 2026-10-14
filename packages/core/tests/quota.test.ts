import { describe, expect, it } from 'vitest';
import { parseAccountQuota } from '../src/index';

// Synthetic values; kind/group/scope witnessed in #201's follow-up evidence:
// https://github.com/getpaseo/paseo/issues/2302 (not fresh Wisp auth acceptance).
const session = (overrides: Record<string, unknown> = {}) => ({
  kind: 'session', group: 'session', scope: null, percent: 42,
  resets_at: '2033-05-18T03:33:20.123456+00:00', severity: 'normal', is_active: true, ...overrides,
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
