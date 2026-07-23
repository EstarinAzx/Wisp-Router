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
};

export type RouteMatch = {
  provider: Provider;
  pinnedModel?: string; // set on alias/family hits only — overrides the Provider's panel model
  matched: 'provider-id' | 'alias' | 'family' | 'active';
};

// The default map: nothing routed, everything falls back to the Active Provider (today's behavior).
export const EMPTY_ROUTING_MAP: RoutingMap = { families: {}, aliases: [] };

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
  const fromTarget = (target: Target, matched: 'alias' | 'family'): RouteMatch | undefined => {
    const provider = byId(target.providerId);
    return provider && { provider, pinnedModel: target.model, matched };
  };

  const direct = byId(requestedModel);
  if (direct) return { provider: direct, matched: 'provider-id' };

  const alias = map.aliases.find((a) => a.name === requestedModel);
  if (alias) return fromTarget(alias.target, 'alias');

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

// The per-provider cooldown store — one instance per Bridge host (the bridgeServer owns it, mirroring the
// diagnosis chain). noteUsageLimit returns the cooldown seconds when the error was a usage-limit 429
// (caller logs it), undefined otherwise. coolingUntil feeds the fallback log line's timestamp.
export type ProviderCooldowns = {
  noteUsageLimit: (providerId: string, errorMessage: string) => number | undefined;
  cooling: (providerId: string) => boolean;
  coolingUntil: (providerId: string) => number | undefined; // epoch ms, undefined when not cooling
};
export const createProviderCooldowns = (now: () => number = Date.now): ProviderCooldowns => {
  const until = new Map<string, number>();
  return {
    noteUsageLimit: (providerId, errorMessage) => {
      const seconds = parseUsageLimitReset(errorMessage);
      if (seconds === undefined) return undefined;
      until.set(providerId, now() + seconds * 1000);
      return seconds;
    },
    cooling: (providerId) => (until.get(providerId) ?? 0) > now(),
    coolingUntil: (providerId) => {
      const t = until.get(providerId);
      return t !== undefined && t > now() ? t : undefined;
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
