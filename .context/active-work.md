---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — openclaude steal #1 released as 2.0.19)._

## Current focus

**None.** 2.0.19 shipped. Openclaude steal #1 live: one-shot bodies write bare
`{type:'ephemeral'}` (5m, 1.25×); multi-turn (`convo.length >= 2`) keep `ttl:'1h'`.
Breakpoints (#111) untouched.

## State

- **In flight:** None.
- **Done this session:**
  - Steal #1 in `buildAnthropicMessagesBody` (`packages/core/src/anthropic.ts`).
  - 98/98 anthropic tests green; decision note + gate clarifications locked.
  - Released `wisp-router@2.0.19` (tag `v2.0.19`, release.yml green, npm live).
  - #2 skipped (already true via STEP). #3 parked (no side-queries).
- **Verified:** unit tests + CI 4-platform build + npm publish.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Install 2.0.19 on the daily driver if not already; drive normal.
No code pending on the steal list.

## Open questions

- Optional #3 (`skipCacheWrite` for forks) only if bridge grows shared-prefix side calls.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-18-openclaude-cache-control-steal-list]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
