// ---------------- status.test.ts — pure statusline snapshot: quota headers + context percentage ---------------- //

import { describe, it, expect } from 'vitest';
import {
  parseAnthropicQuota, parseCodexQuota, quotaWindowLabel,
  contextTokens, contextPercent, contextWindowFor, buildStatus,
  mergeStatus, QUOTA_LEDGER_MAX_AGE_MS,
  type Provider, type BridgeUsage, type WispStatus,
} from '../src/catalog';

// The two live header dumps from the #171 recon, verbatim (see the project gotcha). Kept whole rather than
// trimmed to the fields under test — the noise IS the fixture: it is what made the recon's own keyword
// regex miss x-codex-primary-used-percent.
const CODEX_HEADERS = {
  'x-codex-primary-used-percent': '7',
  'x-codex-primary-window-minutes': '10080',
  'x-codex-primary-reset-at': '1785816697',
  'x-codex-primary-reset-after-seconds': '527331',
  'x-codex-secondary-used-percent': '0',
  'x-codex-secondary-window-minutes': '0',
  'x-codex-plan-type': 'plus',
  'x-codex-active-limit': 'premium',
  'x-codex-credits-balance': '0',
  'x-codex-credits-has-credits': 'False',
  'x-codex-credits-unlimited': 'False',
  'x-codex-safety-buffering-enabled': 'true',
  'x-codex-safety-buffering-faster-model': 'gpt-5.6-luna',
};

const ANTHROPIC_HEADERS = {
  'anthropic-ratelimit-unified-5h-utilization': '0.04',
  'anthropic-ratelimit-unified-5h-reset': '1785305400',
  'anthropic-ratelimit-unified-5h-status': 'allowed',
  'anthropic-ratelimit-unified-7d-utilization': '0.22',
  'anthropic-ratelimit-unified-7d-reset': '1785686400',
  'anthropic-ratelimit-unified-7d-status': 'allowed',
  'anthropic-ratelimit-unified-representative-claim': 'five_hour',
  'anthropic-ratelimit-unified-overage-utilization': '0.0',
  'anthropic-ratelimit-unified-fallback-percentage': '0.5',
};

const headers = (h: Record<string, string>): Headers => new Headers(h);

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'p', label: 'P', baseUrl: '', defaultModel: '', apiKeyEnv: '', ...over,
});

const usage = (over: Partial<BridgeUsage> = {}): BridgeUsage => ({
  input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, ...over,
});

// ----------------------------- Window labels ----------------------------- //

describe('quotaWindowLabel', () => {
  it('renders minutes, hours and days from a minute count', () => {
    expect(quotaWindowLabel(30)).toBe('30m');
    expect(quotaWindowLabel(300)).toBe('5h');
    expect(quotaWindowLabel(10080)).toBe('7d');
  });

  // Codex only reveals its window SIZE via *-window-minutes; primary is not a synonym for weekly.
  it('does not name a window with no size', () => {
    expect(quotaWindowLabel(0)).toBeUndefined();
  });
});

// ----------------------------- Codex ----------------------------- //

describe('parseCodexQuota', () => {
  // The header the recon's keyword regex missed. Integer percent, passed through as-is.
  it('reads primary used-percent as an integer percent with its window label and reset', () => {
    expect(parseCodexQuota(headers(CODEX_HEADERS))).toEqual([
      { label: '7d', percent: 7, resetAt: 1785816697 },
    ]);
  });

  // window-minutes 0 means the window is unused on this plan — a 0% meter for it would be a fabrication.
  it('drops a window whose size is 0', () => {
    const meters = parseCodexQuota(headers(CODEX_HEADERS));
    expect(meters.some((m) => m.percent === 0)).toBe(false);
  });

  // A real secondary window reports alongside the primary, ordered shortest-first.
  it('reports both windows shortest-first when the plan uses two', () => {
    expect(parseCodexQuota(headers({
      ...CODEX_HEADERS,
      'x-codex-secondary-used-percent': '61',
      'x-codex-secondary-window-minutes': '300',
      'x-codex-secondary-reset-at': '1785300000',
    }))).toEqual([
      { label: '5h', percent: 61, resetAt: 1785300000 },
      { label: '7d', percent: 7, resetAt: 1785816697 },
    ]);
  });

  it('is empty for a response carrying no codex quota headers', () => {
    expect(parseCodexQuota(headers({ 'content-type': 'text/event-stream' }))).toEqual([]);
  });

  // A window with a size but no reading is not a 0% meter.
  it('drops a window with a size but no used-percent', () => {
    expect(parseCodexQuota(headers({ 'x-codex-primary-window-minutes': '10080' }))).toEqual([]);
  });
});

// ----------------------------- Anthropic ----------------------------- //

describe('parseAnthropicQuota', () => {
  // Anthropic reports a FRACTION; Codex an integer percent. Both must land on the same scale.
  it('normalizes a 0..1 utilization fraction to a percent', () => {
    expect(parseAnthropicQuota(headers(ANTHROPIC_HEADERS))).toEqual([
      { label: '5h', percent: 4, resetAt: 1785305400 },
      { label: '7d', percent: 22, resetAt: 1785686400 },
    ]);
  });

  // overage / fallback / representative are claims about the account, not time windows — matching them as
  // windows would invent meters named "overage".
  it('ignores unified-* fields that are not time windows', () => {
    const labels = parseAnthropicQuota(headers(ANTHROPIC_HEADERS)).map((m) => m.label);
    expect(labels).toEqual(['5h', '7d']);
  });

  it('is empty for a response carrying no anthropic quota headers', () => {
    expect(parseAnthropicQuota(headers({ 'content-type': 'text/event-stream' }))).toEqual([]);
  });

  it('keeps a window whose reset is missing', () => {
    expect(parseAnthropicQuota(headers({ 'anthropic-ratelimit-unified-5h-utilization': '0.5' })))
      .toEqual([{ label: '5h', percent: 50 }]);
  });
});

// ----------------------------- Context ----------------------------- //

describe('contextTokens', () => {
  // Everything the next turn re-sends counts: uncached input, both cache tiers, and the reply.
  it('sums input, both cache tiers and output', () => {
    expect(contextTokens(usage({
      input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 300, output_tokens: 40,
    }))).toBe(460);
  });
});

describe('contextPercent', () => {
  it('is the token count over the window, rounded', () => {
    expect(contextPercent(50_000, 200_000)).toBe(25);
  });

  // The whole point of the ticket: 122% is a conversation already past the window and doomed upstream.
  // Clamping to 100 would hide exactly the condition worth seeing.
  it('reads above 100 rather than clamping', () => {
    expect(contextPercent(244_000, 200_000)).toBe(122);
  });

  // No window (or no usage) means no honest number — the field is omitted, never guessed.
  it('is undefined without a usable window', () => {
    expect(contextPercent(50_000, undefined)).toBeUndefined();
    expect(contextPercent(50_000, 0)).toBeUndefined();
  });
});

describe('contextWindowFor', () => {
  it('reads the Codex and Anthropic offline caps tables', () => {
    expect(contextWindowFor(provider({ kind: 'codex' }), 'gpt-5.6-sol')).toBeUndefined();
    expect(contextWindowFor(provider({ kind: 'anthropic-oauth' }), 'claude-sonnet-4-5')).toBeGreaterThan(0);
    expect(contextWindowFor(provider({ kind: 'xai-oauth' }), 'grok-4.5')).toBeGreaterThan(0);
  });

  // A keyed Provider's window is only known from models.dev, which the door does not fetch per turn.
  // Unknown window → no context reading at all, rather than a wrong one off a default.
  it('is undefined for a keyed Provider', () => {
    expect(contextWindowFor(provider({ kind: 'openai-chat' }), 'some-model')).toBeUndefined();
  });
});

// ----------------------------- The snapshot ----------------------------- //

describe('buildStatus', () => {
  it('keeps the captured auth revision through an unmetered turn and a Provider switch', () => {
    const first = buildStatus({ now: 100, provider: provider({ id: 'codex' }), model: 'fixture',
      authRevision: 'v1:1:2:3:4:5', meters: [{ label: '5h', percent: 42 }] });
    expect(first.authRevision).toBe('v1:1:2:3:4:5');
    const next = mergeStatus(first, buildStatus({ now: 200, provider: provider({ id: 'anthropic' }), model: 'other', authRevision: 'v1:1:2:3:4:6' }));
    expect(next.authRevision).toBe('v1:1:2:3:4:6');
    expect(next.providers?.codex).toEqual({ updatedAt: 100, model: 'fixture', authRevision: 'v1:1:2:3:4:5', meters: [{ label: '5h', percent: 42 }] });
  });

  it('carries the model, the context reading and the meters', () => {
    const status = buildStatus({
      now: 1785816700000,
      provider: provider({ kind: 'codex' }),
      model: 'gpt-5.4',
      usage: usage({ input_tokens: 200_000, output_tokens: 44_000 }),
      meters: [{ label: '7d', percent: 7 }],
      contextWindow: 1_050_000,
    });
    expect(status).toEqual({
      updatedAt: 1785816700000,
      providerId: 'p',
      model: 'gpt-5.4',
      contextTokens: 244_000,
      contextWindow: 1_050_000,
      contextPercent: 23,
      meters: [{ label: '7d', percent: 7 }],
    });
  });

  // A Provider that reported no usage degrades to omitting the fields, not to showing zero.
  it('omits every context field when the turn reported no usage', () => {
    const status = buildStatus({ now: 1, provider: provider({ kind: 'codex' }), model: 'gpt-5.4' });
    expect(status).toEqual({ updatedAt: 1, providerId: 'p', model: 'gpt-5.4' });
  });

  // No headers → no meters key at all. A synthesized meter is worse than a blank one.
  it('omits meters when none were reported', () => {
    const status = buildStatus({
      now: 1, provider: provider({ kind: 'openai-chat' }), model: 'm', usage: usage({ input_tokens: 5 }), meters: [],
    });
    expect(status.meters).toBeUndefined();
    expect(status.contextTokens).toBe(5);
    expect(status.contextPercent).toBeUndefined();
  });
});

// ----------------------------- The ledger ----------------------------- //

const snap = (over: Partial<WispStatus> = {}): WispStatus => ({
  updatedAt: 1_000_000, providerId: 'anthropic', model: 'claude-fable-5', ...over,
});

describe('mergeStatus', () => {
  it('remembers the previous Provider once the route moves to another one', () => {
    const prev = snap({ providerId: 'codex', model: 'gpt-5.4', meters: [{ label: '7d', percent: 7 }] });
    const merged = mergeStatus(prev, snap({ updatedAt: 1_000_500, meters: [{ label: '5h', percent: 4 }] }));
    expect(merged.providerId).toBe('anthropic');
    expect(merged.providers).toEqual({
      codex: { updatedAt: 1_000_000, model: 'gpt-5.4', meters: [{ label: '7d', percent: 7 }] },
    });
  });

  // The live reading is the top-level snapshot, so a same-wire ledger entry would render twice — but only
  // when the incoming turn actually brought meters to supersede it.
  it('evicts the now-active Provider from the ledger when it brought meters', () => {
    const prev = snap({
      providerId: 'anthropic',
      providers: { codex: { updatedAt: 999_000, model: 'gpt-5.4', meters: [{ label: '7d', percent: 7 }] } },
    });
    const merged = mergeStatus(prev, snap({ updatedAt: 1_000_500, providerId: 'codex', model: 'gpt-5.4', meters: [{ label: '5h', percent: 4 }] }));
    expect(merged.providers).toBeUndefined();
  });

  // #363-sibling (2.0.47): a meter-less active turn (the Anthropic wire omits the unified headers on some
  // responses) must NOT destroy that Provider's last known reading — dropping it blanks the statusline's
  // whole quota block. Keep the aged ledger entry as the fallback until a metered turn supersedes it.
  it('keeps a Provider ledger entry when the active turn reported no meters', () => {
    const prev = snap({
      providerId: 'anthropic',
      providers: { codex: { updatedAt: 999_000, model: 'gpt-5.4', meters: [{ label: '7d', percent: 7 }] } },
    });
    const merged = mergeStatus(prev, snap({ updatedAt: 1_000_500, providerId: 'codex', model: 'gpt-5.4' }));
    expect(merged.providers).toEqual({ codex: { updatedAt: 999_000, model: 'gpt-5.4', meters: [{ label: '7d', percent: 7 }] } });
  });

  // Nothing measured, nothing to remember — an empty entry would claim the wire reported a limit.
  it('does not remember a Provider that reported no meters', () => {
    const merged = mergeStatus(snap({ providerId: 'codex' }), snap({ updatedAt: 1_000_500 }));
    expect(merged.providers).toBeUndefined();
  });

  it('drops an entry older than the ledger window', () => {
    const stale = { updatedAt: 1, model: 'gpt-5.4', meters: [{ label: '7d', percent: 7 }] };
    const merged = mergeStatus(
      snap({ updatedAt: QUOTA_LEDGER_MAX_AGE_MS + 2, providers: { codex: stale } }),
      snap({ updatedAt: QUOTA_LEDGER_MAX_AGE_MS + 2 }),
    );
    expect(merged.providers).toBeUndefined();
  });

  it('carries the ledger through when there is no previous snapshot', () => {
    expect(mergeStatus(undefined, snap({ meters: [{ label: '5h', percent: 4 }] }))).toEqual(
      snap({ meters: [{ label: '5h', percent: 4 }] }),
    );
  });
});
