---
type: decision
project: wisp
updated: 2026-07-19
tags: [context, decision, bridge, advisor, cache]
---

# Advisor cache_control mutation + reviewer frame (2.0.22)

## Decision

Two fixes, one release, both live-verified on a real heavy session:

1. **`buildAnthropicMessagesBody` must never mutate the caller's `rawContent`.**
   Replay a stripped *copy* of the thinking sidecar (any inbound `cache_control`
   removed), never the caller's array. `mark()` was writing breakpoints through
   by reference; the advisor flow builds the request up to three times from the
   *same* `parsed.turns` (base pass → reviewer → continuation), so a marker
   placed on one build leaked back into the turns and stacked on the next —
   past Anthropic's "max 4 blocks with cache_control" cap (`Found 5`).

2. **The reviewer sub-call gets a quarantined frame, never the base system
   prompt, and a flattened transcript.** `reviewerSystem()` +
   `serializeForReview(turns)` in `bridgeAnthropic.ts`. Forwarding
   `parsed.system` (with Claude Code's own `# Advisor Tool` section) plus the
   raw turns made even real Opus echo those meta-instructions instead of
   reviewing. The flattened transcript also keeps the reviewer request under
   the cache cap (one user message → 2 markers). Reviewer is text-only —
   images are noted as `[N image(s) omitted]`, not embedded.

## Why

- Live-reproduced: Anthropic 400 `"A maximum of 4 blocks with cache_control may
  be provided. Found 5."` on the advisor continuation of a real session
  (effort=xhigh, thinking sidecars, tool history, images). Isolation repro
  proved the by-reference mutation of `rawContent` across repeated builds.
- Live-reproduced: reviewer (real Opus) echoed "Call advisor now" / "Routing's
  on real Opus" instead of reviewing — both on Grok (foreign Target) and on
  Anthropic Opus (same family). Root was the frame, not the model.
- Follow-on to [[2026-07-19-wisp-native-advisor-via-door-server-tool]] (2.0.21
  shipped the server role; 2.0.22 makes it survive a real multi-tool session).
- Does **not** reverse #111 (Wisp still places its own breakpoints). It makes
  the placement pure w.r.t. the caller's arrays so multi-build flows are safe.

## Reversibility

Easy. The mutation fix is one branch in `anthropic.ts` (copy + strip). The
reviewer frame is pure helpers in `bridgeAnthropic.ts` + a one-line rewire in
`bridgeServer.ts`. Both are unit-tested; dropping either reverts the path.

## Related

- [[decisions]]
- [[2026-07-19-wisp-native-advisor-via-door-server-tool]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]
- [[buildanthropicmessagesbody-must-not-mutate-caller-rawcontent]]
- [[active-work]]
