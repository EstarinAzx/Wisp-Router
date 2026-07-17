---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (relay chain leg 1 — TUI ops batch implemented)._
_At commit: `92b6023` on branch `tui-ops-batch` (3 commits ahead of `main`@`cc75a1d`/v2.0.12)._

## Current focus

**TUI ops batch (spec #120) SHIPPED on branch `tui-ops-batch`** — all three tickets closed,
loop-arg relay chain stopped (goal met). Work rode a branch, not main (user override this
session). Branch is unmerged and unpushed; merge/PR + release tagging are the next session's
call — see [[pick-up]].

## State

- **In flight:** nothing — chain complete.
- **Done this session (one commit per ticket, each gated by core vitest + tsc both packages +
  tui bun test + a real-App/entry-point verify against a sandbox WISP_HOME):**
  - `71fc0f6` #121 — `/bridge` ensure-on (start if stopped + show Screen; running → re-show
    only), `off` the single argument and only stop, "Bridge is not running." when stopped;
    palette entry + Bridge Screen footer updated; slash-parse test added.
  - `b53b1af` #122 — `/show-log`: 500-line ring buffer (`packages/tui/src/logBuffer.ts`) fed
    by the Bridge's log seam (no-op callback replaced), collects Screen-open-or-not; Log
    Screen tails it via `<scrollbox stickyScroll stickyStart="bottom">` — native auto-follow /
    scroll-to-pause / bottom-resumes + mouse-draggable scrollbar (no SELECT_MOUSE — that shim
    is `<select>`-only). New test file `packages/tui/tests/logBuffer.test.ts` (7 tests, incl.
    sticky behavior on the real renderable).
  - `92b6023` #123 — headless `wisp providers` + `wisp models <provider>`: command-first argv
    dispatch, pure core seam `packages/core/src/discoveryCli.ts` (7 vitest tests, stubbed
    fetch); `fetchModelOptions` extracted from `providerScreens.tsx` to renderer-free
    `packages/tui/src/modelFetch.ts` (throwing `fetchModelList` for the CLI, swallowing
    wrapper keeps the pickers' free-text fallback; old import path re-exported). Unknown id →
    non-zero + `wisp providers` hint; fetch failures print the backend's own words.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Next: merge/PR decision for `tui-ops-batch`, then release tagging (batch
rides the next release; tag must equal `packages/tui/package.json` version).

## Open questions

- Merge `tui-ops-batch` to main directly or via PR? (solo repo — user's call; nothing pushed yet)

## Recent context

- Test suite totals now: core vitest 473, tui bun test 13 (2 files).
- Spec #120 left open deliberately (closes when the batch ships in a release, or user closes);
  #124 (wisp-slot session-awareness) stays parked ready-for-human.
- opentui `scrollbox` (0.4.3) carries stickyScroll/stickyStart natively — reach for it before
  hand-rolling any follow/scroll behavior; SELECT_MOUSE stays select-only.
- Headless command pattern now has TWO precedents: routingCli + discoveryCli (pure core seam,
  thin lazy-imported TUI wrapper, renderer-free — no Screen imports).

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
