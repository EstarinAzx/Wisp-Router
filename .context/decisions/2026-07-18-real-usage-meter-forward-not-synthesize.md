---
type: decision
project: wisp
updated: 2026-07-18
tags: [context, decision]
---

# Forward real token usage through the Anthropic door, not synthesized zeros

**Decision.** The Anthropic door re-encodes every reply, and used to hardcode
`usage: {input_tokens:0, output_tokens:0}` on both `message_start` and
`message_delta`. Now the backend's real usage rides end-to-end: a pure
`anthropicUsage(ev)` helper reads `message_start.message.usage` (initial
input/cache snapshot) and `message_delta.usage` (final cumulative counts);
`anthropicStream` yields a `usage` stream event; both stream unions
(`AnthropicStreamEvent`, `BridgeStreamEvent`) carry it; the encoder folds it via
`setUsage` into real `message_start`/`message_delta` usage blocks. The streaming
door **defers `message_start` until the first usage event** so it carries real
input/cache rather than zeros. Non-Anthropic providers routed through this door
(no upstream usage event) still fall back to numeric zeros.

**Why.** The synthesized zeros meant the wisped client's token/cost meter read
zero — the user couldn't trust the context/cost gauge, and `cache_read` (the
number that proves prompt caching is working) was invisible. Two design facts,
both established by live probing the real wire before building:
`message_delta.usage` carries the COMPLETE final usage (input + both cache tiers
+ output), so it's the authoritative frame — `message_start.output_tokens` is
only an initial ~7. Deferring `message_start` to the first usage event costs no
meaningful latency (it's Anthropic's first frame, sent before generation) while
making input/cache real under any client reading. Both frames are populated so
correctness holds whether Claude Code reads input from `message_start` or
`message_delta`.

**Reversibility.** Easy and low-risk — the `usage` event is purely additive to
both unions; drop the `anthropicStream` yield and revert the encoder to zeros to
undo. No wire-format lock-in, no persisted state. Verified: core vitest 506
(+8), 3 packages typecheck clean, live E2E through a from-source bridge
(`cache_read=1757` visible on a warm call).

## Related
- [[decisions]]
- [[active-work]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[live-verify-the-bridge-from-source-isolated-wisp-home-on-a-spare-port]]
