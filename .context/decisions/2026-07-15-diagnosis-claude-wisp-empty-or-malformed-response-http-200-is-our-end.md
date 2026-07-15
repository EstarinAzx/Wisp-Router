---
type: decision
project: wisp
updated: 2026-07-15
tags: [context, decisions]
---

# Diagnosis: claude-wisp "empty or malformed response (HTTP 200)" is our end (tickets #87/#88)

**Decision:** The intermittent Claude Code error *"API returned an empty or malformed response
(HTTP 200) — check for a proxy or gateway intercepting the request"* seen mid-session under
`claude-wisp` is **our end**, not the network/upstream alone. `claude-wisp` points Claude Code's
`ANTHROPIC_BASE_URL` at the Bridge, so the Bridge *is* the "gateway" the error names. Root cause:
the Anthropic door (`anthropicStream` → door → SSE encoder) forwards a **content-less upstream
turn** (thinking-only, `max_tokens` truncation, or an idle-dropped stream that ends with no `error`
frame) as a structurally-valid-but-**empty** SSE envelope (`message_start` → `message_delta(end_turn)`
→ `message_stop`, zero content blocks). Claude Code rejects that 200 as empty/malformed. The **Codex**
sibling path (`codexStream`) was already hardened against this exact case (tracks whether any delta
arrived, throws when nothing was delivered, surfaces the truncation reason); the Anthropic path never
got the guard. Amplifier: `ANTHROPIC_MAX_TOKENS = 16_000` hardcoded on the OAuth path — with adaptive
thinking on, a heavy turn burns the budget reasoning and emits little/no text (contradicts the
project's own "reasoning models DON'T cap tokens" gotcha). Ticketed as **#87** (port the Codex
empty/truncation guard to `anthropicStream`; surface a diagnostic instead of an empty envelope) and
**#88** (lift the 16K cap; blocked by #87), target wisp-router 2.0.4.
**Why not upstream-only:** real 429/5xx throw before the head is out → clean 502, or mid-stream →
`anthropicErrorFrame` (a real message). Only the *content-less* case slips through as the empty
envelope, and that path is ours to guard — Codex already does.
**Confirm signature:** in the Bridge `[bridge]` logs around a failure — no `[bridge] error` line +
the request just ended ⇒ the empty-envelope path (this bug); `[bridge] error anthropic …` present
but Claude Code still showed "empty or malformed" ⇒ the error frame isn't honored by the client (a
separate, smaller sub-issue to split off #87).
**Reversibility:** the diagnosis is a finding, not a code change yet — the fix lands via #87/#88.

## Related

- [[decisions]] — index
