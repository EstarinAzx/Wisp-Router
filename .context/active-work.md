---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 by Fable 5 (auto)._
_At commit: b9286ed on `main` (clean before this session's docs-only changes)._

## Current focus
**Bridge Routing map — planned, not yet built.** The `/preset init` funnel ran end-to-end this session:
grill → glossary → MVD → PRD → tickets. Every bare Claude name (and any user-invented alias) will route
to its own Provider + pinned model instead of collapsing onto the Active Provider.

## State
- **Done this session (docs/planning only — zero code):**
  - Design grilled + settled: 4 fixed **Family routes** (Opus/Sonnet/Haiku/Fable, fuzzy `claude-*`
    match) + exact-name **Aliases** → **Target** = Provider + pinned model; lookup order Provider id →
    Alias → Family → Active Provider; both Bridge doors, one map; fail-loud on unusable Target;
    aliases advertised in `GET /v1/models`; no wildcards.
  - Glossary: **Routing map / Family route / Alias / Target** added to `CONTEXT.md` (Bridge section).
  - MVD: "Bridge Routing map" section appended to [[happy-path]].
  - **PRD: GitHub issue #50** (`ready-for-agent`).
  - **Tickets: #51 → #52 → #53** (linear chain, blocking edges in bodies):
    #51 Family routes end-to-end (resolver built COMPLETE incl. alias logic + tests; panel rows with
    free-text model field) · #52 Aliases + models-list advertising · #53 per-row model dropdowns.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
1. **`/preset scope 51`** — first unblocked slice. Fresh `feat/` branch off main.
2. Then #52, #53 in order (or `/loop /preset ticket-loop` — all three are `ready-for-agent`).
3. After the routing map ships: **TUI PRD for Wisp** via `/preset init` (user-stated order).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset scope 51 — enter the work loop on the first slice.

## Open questions
- None new. Still deferred by design: forced `tool_choice` + `temperature` not threaded; agent-mode
  vision flake root cause open; OpenAI-door Codex strict-tools limit.

## Recent context
- Resolver seam: both doors currently route at `bridgeServer.ts` (~:278 OpenAI, ~:433 Anthropic) via
  `deps.providers.find(id) ?? Active`; model always `resolveModel(deps.modelMap(), provider)` — the
  pinned-model override must thread through those call sites.
- Panel model lists today serve the **Active Provider only** (webview `refreshModels` → live `/models`;
  OAuth kinds via models.dev in `getState`). Per-row lists for arbitrary Providers = new fetch path —
  deliberately deferred to #53; #51/#52 use free-text model fields (the decided offline fallback).
- Claude Code cannot show aliases in its own model menu (hardcoded picker; no list endpoint on the
  Anthropic dialect) — aliases are typed via `/model sol`, then stick. OpenAI-door tools that read
  `GET /v1/models` DO see them.
- Session also flipped `disable-model-invocation: true → false` on three global skills
  (grill-with-docs, to-spec, to-tickets) at the user's request — ecosystem change, outside this repo.

## Related
- [[overview]]
- [[api]] — Bridge doors (routing map lands there once built)
- [[decisions]] — 2026-07-13 Routing-map entry (rejected paths: wildcards, silent fallback)
- [[gotchas]] — stale-build + dup-panel traps (still the F5 landmines)
- [[happy-path]] — "Bridge Routing map" MVD
