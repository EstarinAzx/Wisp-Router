---
type: decision
project: wisp
updated: 2026-07-18
tags: [context, decision]
---

# OpenClaude cache_control: what Wisp steals next (and what it doesn't)

**Decision.** After comparing openclaude's Anthropic OAuth + prompt-cache path to Wisp's
`buildAnthropicMessagesBody` (#111), the burn hole is already closed. Next Wisp update may
optionally steal **two small policies** from openclaude. It must **not** port openclaude's
full cache stack (cache_edits, break detection, GrowthBook, pass-through of client markers).

**Status today.** Wisped Claude ≈ normal Claude for daily OAuth + tools + thinking + plan
usage. Cache layout is **Wisp-placed equivalent**, not byte-identical to stock Claude Code /
openclaude. That is intentional and stays.

## Source compared (openclaude, 2026-07-18)

| Piece | Where |
|---|---|
| OAuth → Bearer `authToken` | `src/services/api/client.ts:401-408, 645-652` |
| `getCacheControl` / `should1hCacheTTL` | `src/services/api/claude.ts:370-446` |
| Single message marker / `skipCacheWrite` | `src/services/api/claude.ts:3151-3177` |
| System multi-block + scope | `src/services/api/claude.ts:3301-3324` |
| Subscriber gate | `src/utils/auth.ts:1585-1590` |
| 1h latch state | `src/bootstrap/state.ts` (`promptCache1hEligible`) |
| Wisp placement (current) | `packages/core/src/anthropic.ts:230-285` |
| Client markers stripped | `packages/core/src/bridgeAnthropic.ts:159-167` |

## Worth stealing (ranked, optional)

### 1. 1h eligibility latch — only if plan meter still bites
openclaude: default ephemeral; `ttl:'1h'` only when latched subscriber + !overage + allowlist.
Wisp today: always `ttl:'1h'` (`anthropic.ts:237`).

**Biggest optional steal, not biggest problem** — real burn already fixed by #111.
**Port shape (if needed):** bare `{type:'ephemeral'}` by default; add `ttl:'1h'` only when
this request body's user/assistant turn count (after system strip) is `>= 2`. Not session
lifetime, not openclaude's subscriber/overage/GB stack.
- 1 user msg (Inquire / probe) → 5m write
- 2+ turns already in body → 1h
**Skip if** plan usage already stable post-#111 — then YAGNI.
**Gate status 2026-07-18:** OPENED by user request. Steal #1 landed in `buildAnthropicMessagesBody` (`anthropic.ts`): bare ephemeral when `convo.length < 2`, `ttl:'1h'` when `>= 2`. Breakpoints unchanged.

### 2. Single message marker for short chats
openclaude: exactly one message-level marker.
Wisp: up to 3 markers every 15 blocks (lookback walk).

**Port shape:** short convo (≤ ~STEP blocks) → system-tail + last-msg only (openclaude shape);
keep STEP walk only when block count exceeds lookback. Same burn protection, less marker
churn, closer to native Claude.

### 3. `skipCacheWrite` for forks — only if side-queries appear
openclaude shifts the marker to 2nd-to-last so fire-and-forget forks don't pollute KV.
**Port only if** bridge/chat grows shared-prefix side calls (suggest, classify, title). Else skip.

## Do not port

| openclaude thing | Why |
|---|---|
| `cache_edits` / `cache_reference` | Microcompact internals; Wisp doesn't run that stack |
| `promptCacheBreakDetection` | First-party telemetry |
| GrowthBook 1h allowlist | No GB in Wisp; hardcode policy if anything |
| `scope: 'global'` system | First-party beta; not needed on bridge |
| Pass-through of Claude's markers | Already rejected in #111 — keep Wisp-placed |
| Full `getPromptCachingEnabled` matrix | Wisp Anthropic path is always Anthropic-shaped |

## Suggested minimal next slice (if any)

```
#111 already: place markers + strip inbound
optional next in buildAnthropicMessagesBody only (~20 lines, no new module):
  small block-count → 2 markers (system + last)
  large             → keep STEP walk
  turns >= 2 (this request body, after system strip) → ttl: '1h'
  turns < 2                                          → bare { type: 'ephemeral' }
```

**Load-bearing invariant unchanged:** do not remove breakpoints — silent restore of ~10× plan burn
(see [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]).

**Gate 2026-07-18:** opened by request; steal #1 shipped. #2 already true for short convos (STEP walk places one end marker). #3 still parked (no side-queries).

## Related
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[2026-07-18-thinking-passthrough-raw-sidecar]]
- [[decisions]]
