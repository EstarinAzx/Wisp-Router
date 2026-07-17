---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (TUI-ops planning session — spec #120 + tickets)._
_At commit: `cc75a1d` on `main`, tagged `v2.0.12` (release confirmed green + published)._

## Current focus

**TUI ops batch (spec #120)** planned and ticketed: #121 (/bridge ensure-on + `/bridge off`),
#122 (/show-log Log Screen), #123 (headless `wisp providers` / `wisp models <provider>`);
#124 parked backlog (wisp-slot session-awareness). Implementation runs next session as a
`/relay` + `/preset loop-arg` chain — see [[pick-up]]. Grill decision:
[[2026-07-17-bridge-idempotent-on-showlog-panel-command-first-headless-cli]].

## State

- **In flight:** nothing — v2.0.12 confirmed (workflow green, npm shows 2.0.12; one late
  spam-filter re-check still prudent).
- **Done this session:** select scrollbars made mouse-interactive, app-side (opentui's
  SelectRenderable is keyboard-only — see [[gotchas]]):
  - `b38b53e` — `SELECT_MOUSE` in `src/widgets.tsx`, spread into all 8 native `<select>`s;
    thumb-column drag → `setSelectedIndex`.
  - `6dd4bbf` — responsiveness: renderer capture at mousedown (fast flicks no longer die),
    2-cell grab zone.
  - `0b0faeb` — wheel scroll (delta-aware) + click-a-row-selects-it; selection moves verified
    side-effect free (no `onChange` anywhere).
  - `cc75a1d` — release bump 2.0.12 + span baseline re-embed (`bun run spans --update`).
  - First TUI test file: `packages/tui/tests/selectScrollDrag.test.ts` (6 tests, real mouse
    pipeline; `tests/` deliberately outside the tsc include — see [[stack]]).
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Next task: confirm the v2.0.12 release run is green end-to-end (all 4 platform
builds + npm publish), then spot-check `npm view wisp-router version` — the npm spam filter has
silently removed green publishes before ([[gotchas]]).

## Open questions

None.

## Recent context

- New landmine pair for selects: every new native `<select>` must spread **both**
  `SELECT_COLORS` and `SELECT_MOUSE`; any `@opentui/*` bump must re-run `bun test` in
  `packages/tui` (SELECT_MOUSE reads pinned privates — [[gotchas]]).
- opentui wheel events only reach the select when the pointer is over it — the renderer's
  "fallback to focused" scroll path is unreachable in practice (root wins the hit test).
- Screen-module import seams unchanged (#117–#119): payload types from `./modes`, look from
  `./theme`, widgets from `./widgets`, `fetchModelOptions` from `./providerScreens`.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
