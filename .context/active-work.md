---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — real usage meter built, committed on branch, NOT released)._
_Branched from `971cefd` (`main`, tagged `v2.0.17`). Work lives on `claude/real-usage-meter`; not on main, not released._

## Current focus

**Real token meter through the Anthropic door.** Before this session the door
re-encoded every reply and **synthesized `usage: {input_tokens:0, output_tokens:0}`**
— the wisped client's token/cost gauge read zeros, and `cache_read` (the proof
caching works) was invisible. Now the backend's real usage rides end-to-end:
`message_start` carries the real input/cache snapshot, `message_delta` the final
cumulative counts. Built TDD, live-verified through a from-source bridge.

## State

- **In flight:** None — the feature is complete and committed on the branch.
- **Done this session:**
  - `anthropicUsage(ev)` pure helper (catalog) reads `message_start.message.usage`
    + `message_delta.usage`; wire shape proven with a live probe first.
  - `usage` variant threaded through both stream unions (`AnthropicStreamEvent`,
    `BridgeStreamEvent`); `anthropicStream` yields it, `mapOAuthStream` passes it.
  - Encoder gains `setUsage`; real usage in `message_start`/`message_delta`.
    `buildAnthropicMessageResponse` folds usage into the reply block.
  - Door streaming loop **defers `message_start` until the first usage event**
    so it carries real input/cache (Anthropic's first frame, near-instant).
  - See [[2026-07-18-real-usage-meter-forward-not-synthesize]].
- **Verified:** core vitest **506** (was 498; +8 new), all 3 packages typecheck
  clean, **live E2E** through from-source bridge on an isolated home/spare port —
  client-facing `cache_read=1757` on a warm call, real output in `message_delta`.
- **NOT done — the gap to close before it's useful:** **not released.** The
  running install (port 41184) is still the old v2.0.17 zeros build, so *your
  own session's meter is still fake* until a release + `npm i -g`.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Next task = **release the real-usage-meter branch** (or discard
if not wanted). Release makes the meter live in the daily driver.

## Open questions

- Does Claude Code read input tokens from `message_start` or `message_delta`?
  We populate BOTH with real values, so correct under either reading — but
  unconfirmed which the client actually surfaces. Real daily-driving after
  release is the test.
- Non-Anthropic providers routed through the Anthropic door (e.g. `sol` alias)
  still emit zero usage — no upstream usage event. Accepted; out of scope.

## Recent context

- Live-probe recipe for bridge changes: isolated `WISP_HOME` + `serve` on a
  spare port. See [[live-verify-the-bridge-from-source-isolated-wisp-home-on-a-spare-port]].
- `bridgeSecret` is **top-level** in `auth.json`, not under `.anthropic`.
- The real wire: `message_delta.usage` carries the COMPLETE final usage
  (input + both cache tiers + output); `message_start.output_tokens` is only an
  initial ~7, so any correct client reads `message_delta` for the final.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
