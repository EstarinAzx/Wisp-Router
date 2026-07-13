---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 by Fable 5 (auto)._
_At commit: f9c0519 on `feat/routing-map-family-routes` (slice 1 committed, NOT yet pushed/PR'd)._

## Current focus
**Bridge Routing map — slice 1 (#51) BUILT and demo-verified; needs ship, then #52.** Family routes
work end to end: demo showed `[bridge] route family 'claude-sonnet-5' -> codex model=gpt-5.6-sol`
with a live Claude Code session answering from the pinned Codex model.

## State
- **Done this session (#51, commit f9c0519):**
  - `src/routing.ts` — pure resolver, built COMPLETE per ticket: Provider id → Alias exact → Family
    fuzzy (`claude-*` any version/date suffix) → Active fallback; dangling Target → undefined → door
    404s loud. Alias LOGIC included ahead of the #52 UI.
  - `src/routing.test.ts` — TDD'd full decision table, 14 tests. Suite 296/296 green.
  - `bridgeServer.ts` — both doors route via one `routeFor`; pinned model overrides panel model at all
    four send sites (routed requests only); one `[bridge] route …` log line per request.
  - `extension.ts` — map in globalState `wisp.routingMap`, read live per request; `setFamilyRoute`
    validates Target providerId against the catalog.
  - Panel — Bridge → "Routing map": four always-visible Family rows (Provider dropdown + free-text
    model, explicit Unmapped state, webview-local drafts).
  - Subagent review: fixed catalog validation; SKIPPED provider-rename migration for stored Targets
    (YAGNI — write the migration when a rename happens; fail-loud 404 covers it) and draft-resync on
    failed host write (globalState.update can't realistically fail; reopen reseeds).
- **In flight:** branch `feat/routing-map-family-routes` committed locally, not pushed — `/preset ship`
  is the next mechanical step.
- **Blocked:** nothing.

## Pick up here
1. **`/preset ship`** — push the branch, open the PR for #51, merge.
2. **#52 Aliases + models list** — panel add/remove Alias rows (name + Target; panel must refuse an
   Alias shadowing a Provider id) + advertise aliases in both doors' `GET /v1/models`. Resolver needs
   NO changes — alias lookup already built + tested in `routing.ts`.
3. Then #53 (per-row model dropdowns), then **TUI PRD for Wisp** via `/preset init` (user-stated order).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset ship — if the PR still isn't open.

## Open questions
- None new. Still deferred by design: forced `tool_choice` + `temperature` not threaded; agent-mode
  vision flake root cause open; OpenAI-door Codex strict-tools limit.

## Recent context
- Routing seam now: `routeFor` in `bridgeServer.ts` (logs + resolves), called by `handleChat` and
  `handleAnthropicMessages`; pinned model threads as a param into `handleCodexChat` /
  `handleAnthropicChat` / `startProviderStream` and the keyed path (`pinnedModel ?? resolveModel`).
- Anthropic door routes POST-alias-strip: `claude-wisp-<id>` → Provider id; stock `claude-*`
  (background tier) → Family rows. Verified in demo.
- #52's models-list surface: OpenAI door `buildModelsList`, Anthropic door `buildAnthropicModelsList`
  (`bridgeAnthropic.ts`) — aliases must appear in both; Claude Code's own /model picker can't list
  them (hardcoded), users type `/model <alias>`.
- Panel model lists still Active-Provider-only — per-row dropdowns deliberately deferred to #53;
  don't pull that plumbing into #52.

## Related
- [[overview]]
- [[api]] — Bridge doors + Routing map (now live, documented)
- [[decisions]] — 2026-07-13 Routing-map entry (rejected paths: wildcards, silent fallback)
- [[gotchas]] — stale-build + dup-panel traps (still the F5 landmines)
- [[happy-path]] — "Bridge Routing map" MVD
