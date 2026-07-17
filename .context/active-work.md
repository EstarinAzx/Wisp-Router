---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (scrollbar-interactivity session + release 2.0.12)._
_At commit: `cc75a1d` on `main`, tagged `v2.0.12` (pushed with the wrap-up)._

## Current focus

Release **v2.0.12** just went out: the TUI-split source (#115–#119), the select-transparency fix,
and this session's select mouse-interactivity work. Tag push triggers
`.github/workflows/release.yml` (4 native runners → GitHub release → npm `wisp-router`).

## State

- **In flight:** the release workflow run for `v2.0.12` — needs a green check, nothing else.
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
