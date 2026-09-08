// ---------------- routing.ts — the Bridge Routing map: pure name -> Target resolver ---------------- //

/*
 * The Routing map (PRD #50) gives every bridged model NAME its own brain: four fixed Family routes
 * (opus / sonnet / haiku / fable) plus user-named Aliases, each pointing at a Target — a Provider and a
 * pinned model. This module is the PURE resolver both Bridge doors call per request; it is vscode-free
 * and owns no state (the map lives in extension globalState, read live through the BridgeDeps seam).
 *
 * Depends on:
 *   - ./catalog: the Provider type (the resolver only reads Provider.id).
 *
 * Data shapes:
 *   - Target: { providerId, model } — the Provider to answer with and the model pinned for it.
 *   - RoutingMap: { families: per-family optional Targets, aliases: named Targets } (glossary: Routing
 *     map / Family route / Alias / Target — CONTEXT.md).
 *   - RouteMatch: { provider, pinnedModel?, matched } — matched names the row kind for the per-request
 *     Bridge log line; pinnedModel is present only for alias/family hits.
 */

import type { Provider } from './catalog';

// ----------------------------- Types ----------------------------- //

export type Target = { providerId: string; model: string };

// The four Family route keys are FIXED — no wildcards, no user-added families (PRD decision).
export type FamilyKey = 'opus' | 'sonnet' | 'haiku' | 'fable';

export type RoutingMap = {
  families: { [K in FamilyKey]?: Target };
  aliases: Array<{ name: string; target: Target }>;
  codexModels?: Record<string, Target>;
};

export type RouteMatch = {
  provider: Provider;
  pinnedModel?: string; // set on alias/family hits only — overrides the Provider's panel model
  matched: 'provider-id' | 'alias' | 'codex-model' | 'family' | 'active';
};

// The default map: nothing routed, everything falls back to the Active Provider (today's behavior).
export const EMPTY_ROUTING_MAP: RoutingMap = { families: {}, aliases: [] };

const validRouteName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value);
const validTarget = (value: unknown): value is Target => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const target = value as Target;
  return validRouteName(target.providerId) && validRouteName(target.model);
};

// Never drop a malformed explicit binding and silently send its traffic to the Active Provider.
export const validateCodexRoutes = (routes: unknown): void => {
  if (routes === undefined) return;
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)
    || Object.entries(routes).some(([name, target]) => !validRouteName(name) || !validTarget(target))) {
    throw new Error('Invalid routing.codexModels: expected model ids mapped to nonempty Provider/model Targets. Repair config.json.');
  }
};

// Snapshot store (#127): what each held row pointed at when it was snapshotted — a Target, or null
// for a Family route that was unset. Keyed by row name (Family key or Alias name). Presence = held.
// Bookkeeping only: the Bridge resolver never reads it, it just lets `wisp snapshot`/`revert` remember
// and restore rows. Lives in config.json beside the map; the schema layer (home.ts) round-trips it.
export type SnapshotEntry = Target | null;
export type SnapshotStore = { [row: string]: SnapshotEntry };

// ----------------------------- Resolver ----------------------------- //

// Fixed probe order for the family fuzzy match (a claude-* id names at most one family in practice).
// Exported since #65 — the TUI's /routing screen lists the rows in this same order.
export const FAMILY_KEYS: FamilyKey[] = ['opus', 'sonnet', 'haiku', 'fable'];

// Resolve a requested model name to the Provider that must answer it. Lookup order (PRD #50, locked):
// Provider id → Alias exact → Family fuzzy (claude-* ids only, any version/date suffix) → Active
// fallback. Returns undefined when the winning Target (or the Active fallback) names no catalog
// Provider — the caller 404s loud rather than silently falling back.
export const resolveRoute = (
  map: RoutingMap,
  providers: Provider[],
  activeProviderId: string,
  requestedModel: string,
): RouteMatch | undefined => {
  const byId = (id: string): Provider | undefined => providers.find((p) => p.id === id);

  // A Target resolves to a match only if its Provider exists — a dangling id is a loud undefined.
  const fromTarget = (target: Target, matched: 'alias' | 'codex-model' | 'family'): RouteMatch | undefined => {
    const provider = byId(target.providerId);
    return provider && { provider, pinnedModel: target.model, matched };
  };

  const direct = byId(requestedModel);
  if (direct) return { provider: direct, matched: 'provider-id' };

  const alias = map.aliases.find((a) => a.name === requestedModel);
  if (alias) return fromTarget(alias.target, 'alias');

  validateCodexRoutes(map.codexModels);
  if (map.codexModels && Object.prototype.hasOwnProperty.call(map.codexModels, requestedModel)) {
    return fromTarget(map.codexModels[requestedModel], 'codex-model');
  }

  // Family fuzzy fires only on claude-* ids: 'claude-opus-4-8', 'claude-3-5-sonnet-20241022', … — a
  // bare family word ('opus-magnum') is NOT a bridged Claude id and falls through to Active.
  if (/^claude-/i.test(requestedModel)) {
    const lower = requestedModel.toLowerCase();
    const key = FAMILY_KEYS.find((k) => lower.includes(k));
    const target = key && map.families[key];
    if (target) return fromTarget(target, 'family');
  }

  const active = byId(activeProviderId);
  return active && { provider: active, matched: 'active' };
};

// ----------------------------- Usage-limit cooldown (#161) ----------------------------- //

// A provider that answered 429 usage_limit_reached is dead until its plan window resets — codex reported
// resets_in_seconds=551032 (~6 days) in the live capture. Without a cooldown the Bridge re-sends every
// request into the same 429 until the user manually rebinds the family route; with one, family-matched
// claude-* requests fall back to the anthropic Provider automatically and routing heals itself when the
// window ends. In-memory on purpose: a Bridge restart clears a wrong cooldown, and persisting one risks
// stranding a recovered provider.

// Recognize a usage-limit 429 in a provider error message and extract the reset horizon. The message is
// the thrown `<kind> API error 429: {json}` string (body capped at 500 chars upstream — the error object
// fits well inside). Not a usage-limit 429 → undefined (transient 429s must NOT start a multi-day cooldown).
// ponytail: missing resets_in_seconds defaults to 300s — short enough that a wrong guess self-heals.
export const DEFAULT_COOLDOWN_SECONDS = 300;
export const parseUsageLimitReset = (message: string): number | undefined => {
  if (!message.includes('429') || !message.includes('usage_limit_reached')) return undefined;
  const m = /"resets_in_seconds"\s*:\s*(\d+)/.exec(message);
  return m ? Number(m[1]) : DEFAULT_COOLDOWN_SECONDS;
};

// ----------------------------- Transient failures (#168) ----------------------------- //

// The other half of "this provider is unusable": a blip, not a plan window. A backend that 5xx'd, dropped the
// socket, or is at capacity will very likely serve the very next request — so the answer is a bounded retry
// and, if it keeps happening, a cooldown measured in SECONDS. The two channels are kept in separate maps on
// purpose: the worst outcomes here are a blip sidelining a provider for days and a six-day quota exhaustion
// being shortened to seconds, and separate maps make both impossible to write, not merely unlikely.

export const TRANSIENT_COOLDOWN_SECONDS = 30;      // long enough to let a backend breathe, short enough to be invisible
export const TRANSIENT_FAILURES_BEFORE_COOLDOWN = 3; // one blip is not a pattern
export const TRANSIENT_WINDOW_SECONDS = 120;       // failures this far apart are unrelated, not a streak
export const MAX_PROVIDER_ATTEMPTS = 3;            // the bound: a persistently failing provider fails, never hangs
export const RETRY_BASE_DELAY_MS = 200;
export const JITTER_FRACTION = 0.2;

// Add up to JITTER_FRACTION of the wait, so concurrent waiters do not wake in lockstep and stampede the first
// provider to recover. The random source is injected — sampling Math.random in a test is flaky by
// construction. Out-of-range sources are clamped, so the cap holds whatever the caller passes.
export const jittered = (ms: number, random: () => number): number =>
  ms * (1 + JITTER_FRACTION * Math.min(1, Math.max(0, random())));

// The wait before attempt n+1: exponential off the base, jittered. Attempts are 1-based.
export const retryDelayMs = (attempt: number, random: () => number): number =>
  jittered(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), random);

// Statuses that mean "the backend, not the request" — a retry can actually succeed. 429 is included because a
// plain rate limit IS a blip, but the usage-limit guard below runs first so a plan-window 429 can never land
// here. 4xx client errors are absent on purpose: #166 classifies those, and they cannot succeed on a retry.
const TRANSIENT_STATUS = /API error (429|500|502|503|504)\b/;
// Prose forms: a capacity rejection (the ticket's named case — transient, NOT exhausted quota), the node/undici
// socket drops, and a stream that stopped before its terminal frame.
const TRANSIENT_PROSE = /(at capacity|overloaded|socket hang up|fetch failed|premature close|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|stream ended)/i;

// Is this failure worth retrying / worth the short channel? A usage-limit 429 is checked FIRST and always
// answers no — that single line is what keeps a six-day plan window from being read as a blip.
export const isTransientProviderError = (message: string): boolean =>
  parseUsageLimitReset(message) === undefined
  && (TRANSIENT_STATUS.test(message) || TRANSIENT_PROSE.test(message));

// The per-provider cooldown store — one instance per Bridge host (the bridgeServer owns it, mirroring the
// diagnosis chain). noteUsageLimit returns the cooldown seconds when the error was a usage-limit 429
// (caller logs it), undefined otherwise; noteQuotaWindow is its #190 twin for a record that classified the
// failure itself; noteTransient is the short-channel one, returning seconds only on the failure that
// actually trips the cooldown. coolingUntil feeds the fallback log line's timestamp and reports the LATER
// of the two horizons, so a live plan window is never masked by a 30s blip.
export type ProviderCooldowns = {
  noteUsageLimit: (providerId: string, errorMessage: string) => number | undefined;
  noteQuotaWindow: (providerId: string, seconds: number) => void;
  noteTransient: (providerId: string, errorMessage: string) => number | undefined;
  cooling: (providerId: string) => boolean;
  coolingUntil: (providerId: string) => number | undefined; // epoch ms, undefined when not cooling
};
export const createProviderCooldowns = (
  now: () => number = Date.now,
  random: () => number = Math.random,
): ProviderCooldowns => {
  const usageUntil = new Map<string, number>();      // the plan window (#161) — days
  const transientUntil = new Map<string, number>();  // the blip channel (#168) — seconds
  // The streak behind the short channel. A window instead of a success hook keeps this store pure and
  // self-contained: "repeated" means repeated RECENTLY, so an hourly hiccup never accumulates into a cooldown.
  const streak = new Map<string, { count: number; since: number }>();

  const liveUntil = (m: Map<string, number>, providerId: string): number | undefined => {
    const t = m.get(providerId);
    return t !== undefined && t > now() ? t : undefined;
  };

  return {
    noteUsageLimit: (providerId, errorMessage) => {
      const seconds = parseUsageLimitReset(errorMessage);
      if (seconds === undefined) return undefined;
      usageUntil.set(providerId, now() + seconds * 1000);
      return seconds;
    },
    // #190: the SAME long channel, seeded from a horizon the Provider's own record already classified rather
    // than re-parsed out of an error message. noteUsageLimit is the door for Codex's wire, which states its
    // horizon in the body text this module can match; this is the door for a record that did its own parsing
    // and hands over the number. Both write usageUntil and ONLY usageUntil — the blip channel is a different
    // map reachable only from noteTransient, so neither can ever be written from the other side. That
    // separation is the whole point (see the #168 banner): a blip must not sideline a provider for days, and
    // a multi-day window must not be shortened to seconds.
    noteQuotaWindow: (providerId, seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return; // a missing or nonsense horizon is not a cooldown
      usageUntil.set(providerId, now() + seconds * 1000);
    },
    noteTransient: (providerId, errorMessage) => {
      if (!isTransientProviderError(errorMessage)) return undefined;
      const t = now();
      const prior = streak.get(providerId);
      const continuing = prior !== undefined && t - prior.since <= TRANSIENT_WINDOW_SECONDS * 1000;
      const count = continuing ? prior.count + 1 : 1;
      if (count < TRANSIENT_FAILURES_BEFORE_COOLDOWN) {
        streak.set(providerId, { count, since: continuing ? prior.since : t });
        return undefined;
      }
      streak.delete(providerId); // the streak is spent — the next one starts fresh after this cooldown
      const ms = jittered(TRANSIENT_COOLDOWN_SECONDS * 1000, random);
      transientUntil.set(providerId, t + ms);
      return TRANSIENT_COOLDOWN_SECONDS;
    },
    cooling: (providerId) => liveUntil(usageUntil, providerId) !== undefined || liveUntil(transientUntil, providerId) !== undefined,
    coolingUntil: (providerId) => {
      const usage = liveUntil(usageUntil, providerId);
      const transient = liveUntil(transientUntil, providerId);
      return usage === undefined && transient === undefined ? undefined : Math.max(usage ?? 0, transient ?? 0);
    },
  };
};

// Re-aim a resolved route around a cooling provider. Family matches only: a family hit is by construction
// a claude-* model id, so the anthropic Provider can answer it natively with the requested id pinned.
// Provider-id and Alias matches stay untouched — an explicit address must stay honest, and an alias Target
// pins a model no other provider is guaranteed to serve. No fallback when there is no anthropic Provider,
// when the cooling provider IS the anthropic one, or when anthropic is itself cooling — the original match
// returns and the request fails loud as before. isFallbackProvider is injected (catalog's
// isAnthropicProvider) so this resolver stays a pure decision table.
export const withCooldownFallback = (
  match: RouteMatch | undefined,
  requestedModel: string,
  providers: Provider[],
  cooling: (providerId: string) => boolean,
  isFallbackProvider: (p: Provider) => boolean,
): RouteMatch | undefined => {
  if (!match || match.matched !== 'family' || !cooling(match.provider.id)) return match;
  const fallback = providers.find(isFallbackProvider);
  if (!fallback || fallback.id === match.provider.id || cooling(fallback.id)) return match;
  return { provider: fallback, pinnedModel: requestedModel, matched: 'family' };
};

// ----------------------------- Edit operations ----------------------------- //

// Pure map edits (#65) — each returns the next map, or undefined when the edit is refused. Both
// faces persist only a returned map, so a malformed edit can never write a broken route.

// Set or clear one exact Codex route without changing any Alias or Family binding.
export const withCodexModelRoute = (
  map: RoutingMap, providers: Provider[], model: string, target: Target | undefined,
): RoutingMap | undefined => {
  if (!validRouteName(model) || (target !== undefined && (!validTarget(target) || !providers.some(p => p.id === target.providerId)))) return undefined;
  const codexModels = { ...map.codexModels };
  if (target === undefined) delete codexModels[model];
  else Object.defineProperty(codexModels, model, { value: target, enumerable: true, configurable: true, writable: true });
  return { ...map, codexModels };
};

// Set or clear one Family route. Refused when the Target names a Provider outside the catalog.
export const withFamilyRoute = (
  map: RoutingMap,
  providers: Provider[],
  family: FamilyKey,
  target: Target | undefined,
): RoutingMap | undefined =>
  target && !providers.some((p) => p.id === target.providerId)
    ? undefined
    : { ...map, families: { ...map.families, [family]: target } };

// Add or retarget one Alias (upsert by exact name). Refused for an empty name, a dangling Target,
// or a name matching a Provider id — ids win the resolver's lookup, so a same-named alias would be
// silently unreachable.
export const withAlias = (
  map: RoutingMap,
  providers: Provider[],
  name: string,
  target: Target,
): RoutingMap | undefined => {
  if (!name || providers.some((p) => p.id === name)) return undefined;
  if (!providers.some((p) => p.id === target.providerId)) return undefined;
  return { ...map, aliases: [...map.aliases.filter((a) => a.name !== name), { name, target }] };
};

// Rename one Alias in place — Target and row position kept. Refused for an empty or Provider-id
// new name (same shadow rule as withAlias), a new name already taken by ANOTHER alias, or an old
// name not in the map — renaming nothing must not invent a row.
export const withAliasRenamed = (
  map: RoutingMap,
  providers: Provider[],
  oldName: string,
  newName: string,
): RoutingMap | undefined => {
  if (!newName || providers.some((p) => p.id === newName)) return undefined;
  if (newName !== oldName && map.aliases.some((a) => a.name === newName)) return undefined;
  if (!map.aliases.some((a) => a.name === oldName)) return undefined;
  return { ...map, aliases: map.aliases.map((a) => (a.name === oldName ? { ...a, name: newName } : a)) };
};

// Remove one Alias by name. An unknown name is a no-op, never an error.
export const withoutAlias = (map: RoutingMap, name: string): RoutingMap => ({
  ...map,
  aliases: map.aliases.filter((a) => a.name !== name),
});
