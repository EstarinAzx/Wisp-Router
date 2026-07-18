---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — openclaude steal #1 shipped, releasing as 2.0.19)._

## Current focus

**Openclaude steal #1 — conditional cache TTL.** One-shot bodies (Inquire / probe /
first turn) write cache at bare `{type:'ephemeral'}` (5m, 1.25×); multi-turn bodies
(`convo.length >= 2` after system strip) keep `ttl:'1h'` (2×). Breakpoints (#111)
untouched. Real burn was already fixed; this trims the write premium on short calls.

## State

- **In flight:** release 2.0.19 (bump + tag + push).
- **Done this session:**
  - Confirmed daily driver already on `wisp-router@2.0.18` (meter live).
  - Locked steal-list clarifications: `turns >= 2` = this request body; #1 is biggest
    *optional* steal not biggest problem; gate opened by user request despite 98.6% read.
  - Landed steal #1 in `buildAnthropicMessagesBody` (`packages/core/src/anthropic.ts`).
  - Tests 98/98; new case locks one-shot bare vs multi-turn `1h`.
  - #2 skipped (already true for short convos via STEP walk). #3 parked (no side-queries).
- **Verified:** `bun run --cwd packages/core test tests/anthropic.test.ts` → 98 passed.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. After 2.0.19 ships: install daily driver, drive normal. No code pending
unless #3 side-queries appear or meter regresses.

## Open questions

- None load-bearing. Optional #3 (`skipCacheWrite` for forks) only if bridge grows
  shared-prefix side calls.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-18-openclaude-cache-control-steal-list]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
