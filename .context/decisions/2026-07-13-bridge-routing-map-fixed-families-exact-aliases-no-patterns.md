---
type: decision
project: wisp
updated: 2026-07-13
tags: [context, decisions]
---

# Bridge Routing map: fixed families + exact aliases, no patterns

**Decision:** Plan the **Routing map** (PRD #50, slices #51–#53): the Bridge resolves a requested model
name via **Provider id → Alias (exact) → Family route (fuzzy `claude-*`) → Active Provider**, both doors
sharing one map. Rows point at a **Target** = Provider + **pinned model** that overrides the Provider's
panel-selected model for that request only. Exactly **4 fixed Family routes** (Opus/Sonnet/Haiku/Fable) +
user-added exact-name **Aliases**; aliases may not collide with Provider ids (panel-validated) and are
advertised in `GET /v1/models` (Family routes are not). An unusable Target **fails loud** with the
Provider's real error. Map persisted like the per-Provider model memory, read live per request.
**Why:** bridged Claude Code's four picker names all collapsed onto the Active Provider — 4 names, 1
brain — and switching required a global panel round-trip; aliases give per-session/per-subagent pinning
(`/model sol` main + `terra` subagent simultaneously). **Rejected paths:** wildcard/pattern rules
(speculative — real traffic is exactly the 4 families + invented exact names; patterns add ordering rules
and typo-silently-misroutes) and silent fallback on a broken Target (re-creates the exact label≠brain
confusion the feature exists to kill). Glossary terms live in `CONTEXT.md`; MVD in `happy-path.md`.
**Reversibility:** easy (additive feature) — but don't add wildcards or a silent-fallback mode without
re-reading this; both were explicitly rejected, not overlooked.

## Related

- [[decisions]] — index
