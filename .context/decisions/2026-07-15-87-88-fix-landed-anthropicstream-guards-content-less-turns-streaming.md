---
type: decision
project: wisp
updated: 2026-07-15
tags: [context, decisions]
---

# #87/#88 fix landed: anthropicStream guards content-less turns; streaming max_tokens = model ceiling

**Decision:** Ported the Codex empty/truncation guard to `anthropicStream` (#87, PR #89 → `2008cd8`)
and lifted the 16K output cap on the streaming path (#88, PR #90 → `5c24299`). Both on `main`, target
wisp-router 2.0.4. `bun run test` **387** (+11), vscode `tsc` clean.
- **#87 mechanics:** `anthropicStream` now tracks whether any text/tool delta arrived and reads
  `message_delta`'s `stop_reason`. At stream end — (a) a **truncation** reason (`max_tokens` /
  `content_filter` / `refusal`, via the new pure `anthropicTruncationReason`) is surfaced as a visible
  `_[Response truncated: <reason>]_` marker, even when nothing else was delivered; (b) a **truly
  content-less** turn (no text, no tools, no truncation reason — thinking-only / dropped) **throws**,
  so the door writes a real `anthropicErrorFrame` / clean 502 instead of the silent empty envelope,
  and the turn is retryable; (c) delivered content whose **terminal frame was lost** is kept, only the
  abrupt end flagged. Mirrors `codexStream` exactly.
- **#88 mechanics:** the streaming request's `max_tokens` = `anthropicModelCaps(model).maxOutput`
  (Opus 128K, Sonnet/Haiku 64K), not a hard 16K. `anthropicModelCaps`'s return type was tightened to
  pin `maxOutput` as always-present so the streaming path reads it as a non-optional number (no caller
  fallback). **Inquire keeps the bounded cap** (renamed `INQUIRE_MAX_TOKENS = 16_000`): non-streaming
  spinner→diff bounded by the fetch timeout ceiling — reviewed, justified.
**Why the design choices:** (1) **Throw for truly-empty** rather than yield a synthetic notice — parity
with `codexStream`, and it uses the door's intended `anthropicErrorFrame` path (L497-499), so Claude Code
retries a transient drop instead of ingesting a fake assistant turn into `/loop` history. (2) **Marker,
not stop_reason threading** for truncation — the encoder always emits `end_turn`; surfacing the reason as
text (like Codex) is the minimal change and needs no encoder/`BridgeStreamEvent` widening. (3) **Model
ceiling, not unbounded** for max_tokens — the model max is the documented ceiling; if the subscription
caps lower the backend errors (now diagnosable via #87).
**Residual (unverified — needs a live `claude-wisp` run):** #87's content-less path assumes Claude Code
**honors the `error` frame written after `message_start`**. If a live failure logs `[bridge] error
anthropic …` but Claude Code still shows "empty/malformed", that's the sub-issue split the diagnosis
entry's confirm signature names.
**Reversibility:** both are additive guards — easy to revert. But the throw-on-empty / marker-on-truncation
shape is the deliberate Codex-parity contract; don't swap the empty case to a silent yield or re-cap the
streaming path at 16K.

## Related

- [[decisions]] — index
