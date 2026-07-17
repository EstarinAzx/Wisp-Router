---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (auto, relay leg 3 — chain wind-down)._
_At commit: `26418dd` on `main` (last release tag `v2.0.11`)._

## Current focus

The TUI split (spec #114) is **complete** — #115–#119 all closed, #114 closed with the five
children's commits. The `/relay N=2 /preset loop-arg` chain that drove it has stopped (goal met,
both stop flags set in `.claude/loop-arg.md` + `.claude/relay/loop-arg.md`). Next up: tag a
release.

## State

- **In flight:** nothing — the loop chain wound down cleanly.
- **Done this session (leg 3):** #119 — `src/paletteScreen.tsx` (palette input + suggestion
  rows), `src/testScreen.tsx` (TestScreen + `streamTestReply` colocated, re-exported from
  app.tsx for headless use), `src/infoScreens.tsx` (BridgeScreen + HelpScreen), all in
  `26418dd`. Shell holds no per-Screen JSX — Mode machine, dispatch, keyboard, starters, race
  guards; 583 lines (the spec's 350–400 estimate undercounted what it assigns to the shell —
  rationale on the #119 breadcrumb). Gates green: spans 32/32 byte-identical, `tsc`, scoped
  verify skill (sandbox `WISP_HOME` routing CLI text/`--json`/bad-flag probes). Then #114
  closed — split done.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Next task: tag a release — the whole split (#115–#119) + the
select-transparency fix `bb6465b` are source-only; the published binary is still 2.0.11. Tag
must equal `packages/tui/package.json` version (release.yml gate), and the span harness embeds
the version header — the version bump requires `bun run spans --update` in the same change.

## Open questions

None.

## Recent context

- Screen-module import seams (breadcrumbs on #117/#118/#119): payload types from `./modes`,
  look from `./theme`, `wrapWords` from `./widgets` (`onSubmitText` now lives with
  PaletteScreen's composition), `fetchModelOptions` from `./providerScreens` — never from the
  shell. `PANEL`/`SELECT_COLORS` no longer imported by the shell.
- New native `<select>`s must spread `SELECT_COLORS` — canonical home `src/theme.ts` (#116).
- bg-session edit guard reads the **session cwd's** project settings: the root
  `.claude/settings.json` `{"worktree":{"bgIsolation":"none"}}` didn't cover a leg spawned with
  cwd `packages/tui` — an untracked twin now sits at `packages/tui/.claude/settings.json`.
- The span harness (`bun run spans`) embeds the version header — a version bump requires
  `--update` in the same change; never inside a move-only step (#115 breadcrumb).

## Related

- [[overview]]
- [[pick-up]]
- [[api]]
- [[decisions]]
- [[happy-path]]
- [[gotchas]]
