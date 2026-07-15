---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Door vision: tool_result images hoist into the turn's images[]

**Decision:** The Anthropic door lifts image blocks found INSIDE tool_result content up into the
normalized turn's images[] instead of extending the toolResults shape with its own image slot; and the
door logs images=N per request as the vision ground-truth observable.
**Why:** Claude Code's Read-on-image returns pixels inside tool_result; the normalized seam (shared with
the OpenAI door and all three send-builders) carries plain-text tool results only. Hoisting reuses the
existing images pipe end to end (one-line per builder, zero new shapes); per-result image association is
lost, which no backend currently needs. The images=N line settled a false alarm the same day: codex
inline vision was suspected broken but images=1 proved delivery - GPT models just prefer Read when the
attach's source path is visible in text. Don't reopen "codex inline attach is broken" without images=0
evidence.
**Reversibility:** easy (add a per-result image slot later if a backend ever wants true association).

## Related

- [[decisions]] — index
