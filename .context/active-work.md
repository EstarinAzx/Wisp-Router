---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (auto, relay leg 2)._
_At commit: `62c6aa3` on `main` (last release tag `v2.0.11`)._

## Current focus

The TUI split (spec #114) is 4/5 done, driven by an unattended `/relay N=2 /preset loop-arg`
chain (state: `.claude/loop-arg.md` + `.claude/relay/loop-arg.md`). #115–#118 closed with
breadcrumb comments; #119 (palette/test/info Screens — finish the shell) is the last ticket.

## State

- **In flight:** relay leg 3 works #119 next — extract palette/test/info Screens, shell lands
  ~350–400 lines. Gate: `bun run spans` (never `--update`) + `tsc` + the scoped
  `packages/tui:verify` skill (required on #119 per the loop goal, not just CLI smoke).
- **Done this session (leg 2):** #117 — `src/providerScreens.tsx` (`a373a70`): ten
  provider-flow Screens + key/model storage helpers + `EFFORT_LADDER` + `fetchModelOptions`;
  `onSubmitText` moved to `src/widgets.tsx`. #118 — `src/routingScreens.tsx` (`62c6aa3`):
  eight routing-flow Screens + row helpers (`routingMap`, `rowLabel`, `sectionOf`,
  `CLAUDE_FAMILY_MODELS` exported to the shell's starters). Both gates green: spans 32/32
  byte-identical, `tsc` clean, sandbox `WISP_HOME` routing CLI smoke.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. If the relay chain is still running, do NOT double-work #119 — check
`gh issue list` and `.claude/loop-arg.md` first. After #119 closes: close spec #114, then tag
a release (the select-transparency fix `bb6465b` + the whole split are source-only; published
binary is still 2.0.11).

## Open questions

None.

## Recent context

- Screen-module import seams (breadcrumbs on #117/#118): payload types from `./modes`, look
  from `./theme`, `wrapWords`/`WrapSelect`/`onSubmitText` from `./widgets`,
  `fetchModelOptions` from `./providerScreens` — never from the shell.
- New native `<select>`s must spread `SELECT_COLORS` — canonical home is `src/theme.ts` since
  #116 (comment travels with the const).
- Background relay legs hit the bg-session edit guard; `.claude/settings.json` now sets
  `{"worktree": {"bgIsolation": "none"}}` so spawned legs can edit the checkout (left
  untracked, machine-local).
- The span harness (`bun run spans`) embeds the version header — a version bump requires
  `--update` in the same change; never inside a move-only step (#115 breadcrumb).

## Related

- [[overview]]
- [[pick-up]]
- [[api]]
- [[decisions]]
- [[happy-path]]
- [[gotchas]]
