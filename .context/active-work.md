---
type: active-work
project: wisp
updated: 2026-07-19
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-19 16:xx by Opus 4.8 (1M) (auto)._
_At commit: fb418fc (release 2.0.20)._

## Current focus

**Nothing code-pending — drive normal.** The Anthropic cache-TTL fix is merged and
**2.0.20 is live** (npm `wisp-router@2.0.20` + GitHub release `v2.0.20` with all 4 platform
binaries). Daily driver can update off 2.0.19 (which shipped the bug).

## State

- **In flight:** none.
- **Done this session:** merged `claude/anthropic-cache-ttl-fix` → main (`--no-ff`), then cut
  release 2.0.20 (commit `fb418fc`: `packages/tui/package.json` bump + span-baseline `--update`
  + CHANGELOG). Tag `v2.0.20` pushed → release.yml green (4 native builds + npm publish). The
  fix moves the Anthropic cache TTL from turn-count (`convo.length >= 2 ? 1h : 5m`) to fixed
  **per call path** — `anthropicStream`→1h, `anthropicInquire`→5m, haiku always 5m — plus a
  `prompt-cache MISS` log on the Bridge's Anthropic door (`anthropicCacheOutcome`). Indexed the
  branch's decision + gotcha entries (they'd been created but left unlinked).
- **Verified:** 513 core tests · core `tsc` · tui `tsc` all clean before merge; release run
  29673836237 all-green; `npm view wisp-router@2.0.20` = 2.0.20; `gh release view v2.0.20` shows
  4 assets.
- **Blocked:** none.

## Pick up here

No active work — pick a new task. Housekeeping still open: the merged branch
`claude/anthropic-cache-ttl-fix` (local + remote) can be deleted now that 2.0.20 shipped.

## Skills for next session

_None clearly apply — new task will pick its own route._

## Open questions

- Optional openclaude cache steal #3 (`skipCacheWrite` for forks) still parked — only worth it
  if the Bridge grows shared-prefix side calls.

## Recent context

- 2.0.19 (the release right before this) *introduced* the turn-count TTL; 2.0.20 fixes it. Not
  an old wound — the immediately-prior release.
- The `prompt-cache MISS` log only fires past the first exchange (≥3 turns) with a large uncached
  input — it's the #111-regression shape, deliberately silent on healthy hit/fresh turns.
- Load-bearing invariant unchanged: do NOT remove the #111 cache breakpoints, and do NOT
  re-derive the TTL from `convo.length` (see gotcha).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]]
- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]
