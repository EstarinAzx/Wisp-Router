---
type: decision
project: wisp
updated: 2026-07-16
tags: [context, decision]
---

# Anthropic cache breakpoints are Wisp-placed, not passed through (#111)

**Decision.** `buildAnthropicMessagesBody` places exactly two `cache_control: ephemeral`
breakpoints on every outbound Messages body: the LAST system block and the FINAL message's
last content block. Inbound `cache_control` from bridged clients stays ignored (the
turn shape carries no cache annotation) — Wisp does not preserve or forward client markers.
A bare-string final turn converts to a single text block to carry the marker; every earlier
plain turn keeps the bare-string #29 shape.

**Why.** Without breakpoints the OAuth path re-billed the whole conversation uncached every
turn (~5-10x plan-usage weight; observed 6%→80% in one session). Two markers are sufficient
and minimal: Messages renders tools → system → messages, so the system-tail marker caches
the tool definitions too, and the final-message marker advances turn by turn (incremental
prefix caching). Own-placement over pass-through because the internal turn representation is
provider-agnostic and Claude Code's own placement adds nothing the two fixed markers don't
cover. Applies to ALL Anthropic-provider calls (Bridge, chat, Inquire) — one-shot Inquire
pays the 1.25x write premium once, not worth a knob. Known ceiling (documented in code): the
20-block cache lookback — a single turn adding >20 blocks misses the previous entry; add
intermediate breakpoints only if observed.

**Reversibility.** Easy code-wise (one function), but removing the markers silently restores
the 10x burn — treat the two breakpoints as load-bearing when touching the body builder.

## Related
- [[decisions]]
- [[gotchas]]
