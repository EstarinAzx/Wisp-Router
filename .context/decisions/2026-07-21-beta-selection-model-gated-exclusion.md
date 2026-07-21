---
type: decision
project: wisp
updated: 2026-07-21
tags: [context, decision]
---

# anthropic-beta selection is model-gated, with 1M as an exclusion list — SHIPPED (#151, PR #155)

**Decision.** `selectAnthropicBetas(model)` (`anthropicClient.ts`) picks the
`anthropic-beta` tokens per request instead of one fixed string. Three rules:

1. **context-1m is an EXCLUSION gate, not an allowlist** — everything except
   haiku / claude-3 / opus-before-4-6 gets it. New families (sonnet-5, fable-5)
   inherit 1M automatically, the way real claude's experiment latch pushes it
   broadly (openclaude `claude.ts` pushes on the latch without a model check).
2. **Haiku keeps `claude-code-20250219`** — deliberate deviation from real claude,
   which drops it on NON-agentic haiku utility calls. Every wisp Haiku turn is a
   real user conversation (agentic), and the token is the primary 429 gate.
3. **Heavier-shape betas stay off** (advanced-tool-use, structured-outputs,
   cache-diagnosis), and the door does NOT pass through inbound `anthropic-beta`:
   the door normalizes inbound traffic to wisp turns, so those request shapes
   never leave wisp. Post-#151 wisp's own selection matches what a real claude
   client negotiates for the shapes wisp emits — passthrough only becomes worth
   revisiting if the door ever starts forwarding a shape wisp doesn't build.

## Why

An allowlist regex (`sonnet-4|opus-4-[6-9]`) was the first draft and would have
silently STRIPPED context-1m from the newer 5-family models in wisp's own catalog —
allowlists rot forward. Live 2.1.216 capture (12 tokens on a plain agentic probe) is
the parity target; openclaude `utils/betas.ts` supplied the gating structure but is
version-behind on the token list, so captures beat it on lists, it wins on shape.
Both header shapes (haiku 10-token, opus-4-8 12-token) were live-accepted, no 400/429.

## Reversibility

High. The function is pure and exported; tightening a gate is a one-line regex edit
plus the matching test. Adding door passthrough later composes (merge inbound tokens
into the selected set) without unwinding this.

## Related

- [[decisions]]
- [[2026-07-21-anthropic-oauth-fingerprint-unvalidated]] — the umbrella #148 wire-parity backlog this closes an item of
- [[active-work]]
