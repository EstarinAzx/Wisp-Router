---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Fable 5 (auto)._
_At commit: `8483598` on `main` (not pushed this session)._

## Current focus
Routing CLI snapshot half is complete: `wisp routing` now exposes the live map to humans and `--json` emits a faithful machine snapshot. Next frontier is #109, which adds validated set/unset writes and credential warnings so external tools can complete the flip/restore dance.

## State
- **In flight:** None.
- **Done this session:** #108 committed as `8483598` and closed. Added pure `packages/core/src/routingCli.ts`, tests, core export, thin `packages/tui/src/routingCli.ts`, and lazy routing dispatch in `packages/tui/src/index.tsx`.
- **Blocked:** None. #109 was blocked by #108 and is now ready.

## Pick up here
Run `/preset scope 109`, then implement `wisp routing set <row> <target>` and `unset <row>` against the existing pure core seam. Read GitHub #109 and spec #107 first. Extend `packages/core/src/routingCli.ts` + `packages/core/tests/routingCli.test.ts`; keep filesystem/auth lookup/printing in `packages/tui/src/routingCli.ts`; document commands in the TUI README. Verify one live next-request Bridge reroute with a safe target before closing #109.

After #109, continue to #110: personal Slot skill in `~/.claude/skills/`.

## Skills for next session
- `superpowers:brainstorming` — design is already settled; use it only to confirm #109 boundaries before planning.
- `superpowers:writing-plans` — turn #109 acceptance criteria into the TDD execution plan.
- `superpowers:test-driven-development` — core argv/edit behavior needs red-green coverage.
- `verify` — exercise the real CLI and one live Bridge next-request reroute with isolated state where possible.

## Open questions
None for #109. Carried unknowns outside this task: Grok 4.5 public API billing; Bridge client-tag heuristic sometimes labels Claude Code as `(panel)`.

## Recent context
- `--json` serializes the live `RoutingMap` directly; it does not materialize missing family keys or reorder aliases.
- Family rows come from shared `FAMILY_KEYS`; the CLI does not maintain a second hardcoded family list.
- Runtime verification used isolated `WISP_HOME`; unknown and duplicate flags exit 1, empty home shows four Active Provider fallbacks.
- Final verification: 441/441 core tests, core + TUI TypeScript clean, independent review ready to merge.
- User's installed global wrapper still needs a future release containing `8483598`; current source command works through Bun.

## Related
- [[overview]]
- [[pick-up]]
- [[flows]]
- [[decisions]]
- [[gotchas]]
- [[happy-path]]
