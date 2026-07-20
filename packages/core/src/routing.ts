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
