---
type: decision
project: wisp
updated: 2026-07-15
tags: [context, decisions, bridge, claude-code]
---

# The Anthropic door must honor `stream:false` — Claude Code `/model` validation is non-streaming

**Decision:** the Bridge Anthropic door (`/v1/messages`) branches on the request's `stream` flag. `true`
→ the existing SSE encoder. `false` → buffer the provider stream into ONE JSON Messages object carrying a
`usage` block (`buildAnthropicMessageResponse` in `bridgeAnthropic.ts`, wired at `handleAnthropicMessages`
in `bridgeServer.ts`). Usage is zeroed (Wisp meters no tokens, same as the streaming frames) — the field
just has to be present and numeric.

**Why:** this **corrects the slice-#45 assumption** that "Claude Code always streams, so the door is
SSE-only." It doesn't: Claude Code's `/model <id>` validation sends a **non-streaming** probe and reads
`usage.input_tokens` off what it assumes is a JSON Messages body. The SSE-only door handed it an
event-stream, so `usage` was undefined and `/model` crashed with `undefined is not an object (evaluating
'B.usage.input_tokens')` — for both a Provider id and an alias, since the probe dies before routing. Two
consequences beyond the crash: (1) an Anthropic-Messages endpoint is only spec-compliant if `stream:false`
yields a JSON object, so this is a real conformance fix, not just a Claude Code workaround; (2) it
**unblocks assigning a Wisp alias to a Claude Code subagent** — subagent `model:` accepts any bridged id
behind a custom `ANTHROPIC_BASE_URL`, so it was gated by the same validation crash, not a missing feature.

**Reversibility:** easy (the branch is additive; the streaming path is untouched). But don't revert to
SSE-only — the regression test in `bridgeServer.test.ts` (non-streaming POST → JSON body with
`usage.input_tokens`) guards it. LIVE-VERIFIED: real Claude Code `/model kimi` switched clean.

## Related

- [[decisions]] — index
- [[active-work]] · [[overview]]
