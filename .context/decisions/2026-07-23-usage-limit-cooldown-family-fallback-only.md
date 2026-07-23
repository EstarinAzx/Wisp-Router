---
type: decision
project: wisp
updated: 2026-07-23
tags: [context, decision]
---

# Usage-limit cooldown is in-memory, and only family routes fall back — SHIPPED 2.0.34 (#161)

**Decision.** `createProviderCooldowns` / `withCooldownFallback` (`routing.ts`,
wired in `bridgeServer.ts`): a provider whose error is a `429 usage_limit_reached`
is marked cooling for `resets_in_seconds` (default 300s when absent), and while it
cools, **family-matched** `claude-*` requests re-aim to the anthropic Provider with
the requested id pinned. Three deliberate limits:

1. **In-memory only** — a Bridge restart clears every cooldown. Persisting one
   risks stranding a recovered provider (plan upgrades, early resets) with no
   observable to debug; a wrong in-memory cooldown self-heals on restart.
2. **Family matches only** — a family hit is by construction a `claude-*` id the
   anthropic Provider serves natively. Provider-id and Alias matches never re-aim:
   explicit addressing stays honest, and an alias Target pins a model no other
   provider is guaranteed to serve.
3. **Usage-limit 429s only** — transient rate-limit 429s and 5xx never start a
   cooldown; a multi-day route flip needs the plan-limit signal
   (`"type":"usage_limit_reached"` in the error body).

## Why

Live 2026-07-23 capture: codex 429'd with `resets_in_seconds=551032` (~6 days);
every fable-family request 502'd until the user manually rebound the family row to
anthropic, and the manual flip landed a 274k-token cold-cache re-bill (~$5.50 at
Fable 1h-TTL write rates) plus days of route babysitting. The cold write at the
switch is unavoidable (anthropic must ingest the history once); the babysitting,
retry churn, and flap-driven repeat re-bills are not.

## Reversibility

High. Both functions are pure and injected (`cooling` predicate,
`isFallbackProvider`); widening fallback to aliases or persisting cooldowns
composes on top without unwinding anything. Deleting the `withCooldownFallback`
call in `routeFor` restores pre-#161 behavior exactly.

## Related

- [[decisions]]
- [[active-work]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]] — the other half of the 2026-07-23 bleed triage (aux-fork prefix variants, upstream, not wisp-fixable)
