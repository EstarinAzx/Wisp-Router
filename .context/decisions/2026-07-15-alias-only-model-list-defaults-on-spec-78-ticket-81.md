---
type: decision
project: wisp
updated: 2026-07-15
tags: [context, decisions]
---

# Alias-only model list defaults ON (spec #78, ticket #81)

**Decision:** `bridge.aliasOnlyModels` resolves to **on** when unset — a read-time `?? true` at
the one shared seam every consumer reads through (Bridge list, TUI command echo, panel checkbox),
never a migration write; a stored explicit `false` is respected. With alias-only effectively on
but zero Aliases in the Routing map, the Anthropic-door model list **falls back to Provider rows**
instead of serving empty, which also retires `/aliasonly`'s zero-alias refuse-guard. After a
Provider is selected, the TUI nudges once toward `/routing`.
**Why:** the clean Claude Code `/model` list is the product's intended steady state — opt-in made
it undiscovered; the owner wants `/providers` → `/routing` to be the taught path. The fallback is
what makes default-ON safe on fresh installs (an empty picker was the original reason for
default-OFF + guard). Read-time (not stored) flip keeps upgrades write-free and explicit choices
intact.
**Reversibility:** easy (flip the default back) — but the zero-alias fallback should stay
regardless; an empty model list is never right.

## Related

- [[decisions]] — index
