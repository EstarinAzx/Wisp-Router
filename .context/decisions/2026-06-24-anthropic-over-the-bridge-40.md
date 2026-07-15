---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Anthropic over the Bridge (#40)

**Decision:** Make `kind:'anthropic-oauth'` reachable on `POST /v1/chat/completions` by mirroring the #39
Codex send-path exactly, swapping the Codex cores for the Anthropic ones: `handleAnthropicChat` drives
`anthropicStream` (Messages SSE) on `anthropicAuth.current()` creds, **raw** `deps.effort()`, `toAnthropicTools`,
with `parsed.system` re-attached as a leading `role:'system'` message. `/v1/models` and `handleChat` flip
anthropic from the stub to live; `BridgeDeps` gains `anthropicSignedIn`/`anthropicCreds`, wired from the
getters `registerWispChatProvider` already receives.

**Why:** zero new auth/transport — reuse the exact cores the LM Chat Provider's Anthropic branch uses, so the
only new code is the turn/stream mapping. Two details: effort is passed **raw** (Anthropic's body builder maps it
via `anthropicThinkingEffort`; only Codex needs `standardEffortToCodex`), and **images are dropped** (matches
`toAnthropicMessages`; Anthropic image support is a separate follow-up). The deferred shared-renderer refactor
(flagged in the #39 entry as "take it with #40") was **declined** — a third near-identical block is cheap and the
keyed/Codex paths are F5-verified; a renderer refactor now risks regression for no functional gain. `ponytail`.

**Verification:** `tsc` clean, **234 tests green** (glue → not unit-tested per PRD), live `Invoke-RestMethod`
`model:'anthropic'` → `finish_reason=stop` with real text through the Claude.ai subscription.
**Reversibility:** easy/additive — revert to restore the anthropic `400`. No ADR.

## Related

- [[decisions]] — index
