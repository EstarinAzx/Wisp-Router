---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Claude (remote session, #111 cache follow-up)._
_At commit: `f33785d` on branch `claude/context-rehydration-oargfe` (pushed,
NOT merged). `main` is unchanged at `f1fe5d6`._

## Current focus

**A #111 follow-up fix is parked on `claude/context-rehydration-oargfe`,
awaiting local review + merge.** It closes the residual cache-breakpoint hole
that still let heavy parallel-tool turns re-bill the conversation prefix. Not
merged, not released — the running `claude-wisp` binary does not have it yet.

## State

- **In flight:** `f33785d` on this branch — review `git diff main`
  (`packages/core/src/anthropic.ts` + `anthropic.test.ts`), merge to `main`.
- **Done this session:**
  - Rehydrated context, then audited the shipped #111 fix (`e5ec476`) end to
    end. Verdict: the fix is correct and IS the core fix; the flagged residual
    "20-block lookback" hole is real; the analysis's proposed one-leapfrog fix
    was imprecise (doesn't close a single >20-block turn — intermediate markers
    inside the fat turn do).
  - `f33785d` — `buildAnthropicMessagesBody` now spreads up to 3 message-level
    breakpoints (one every ~15 blocks, walking back from the end) so no gap
    exceeds the ~20-block cache lookback. No-op for normal conversations
    (byte-identical body); only fat parallel-tool turns trigger extras.
  - Verified: `bun run compile` clean, `bun run test` = 474 (was 473; +1
    fat-turn regression). No `packages/tui` touch → no span recapture, no bump.
- **Blocked:** None. Merge/release is the human's call (solo-repo habit is
  straight-to-`main`; this session was pinned to a branch instead).

## Pick up here

See [[pick-up]]. Ship path: review → merge to `main` (core-only, no recapture) →
optional `v2.x` release to push the fix into the `claude-wisp` binary (that step
DOES need a `packages/tui/package.json` bump + span recapture + changelog).

## Open questions

- Do the optional fidelity gaps get fixed? `is_error` passthrough (threads the
  shared normalized `toolResults` shape, ~4 files) is the cheapest; thinking /
  PDF / 1h-TTL left alone deliberately. None are quota bugs.
- Elucidate's badge is also purple — unrelated older open question, still open.

## Recent context

- The shipped #111 fix (`e5ec476`) already killed the big 5–10x burn (dropped
  `cache_control`). This follow-up only addresses the smaller, bounded residual
  leak on big tool-batch turns.
- Test suite totals: core vitest **474**, tui bun test 13 (unchanged this
  session — the change is core-only).

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
