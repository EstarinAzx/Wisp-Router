---
type: decision
project: wisp
updated: 2026-07-18
tags: [context, decision]
---

# Anthropic cache TTL is fixed per request PATH, not derived from turn count (supersedes the ttl half of #111)

**Decision.** `buildAnthropicMessagesBody` no longer chooses the cache TTL from `convo.length`. It takes a
`cacheTtl: '5m' | '1h'` from the caller (default `'1h'`) and applies it to every breakpoint on the body.
The two client entry points fix it once, by path:

- `anthropicStream` (Bridge sessions + native chat — the conversational path) → **`'1h'`**.
- `anthropicInquire` (Inquire + the TUI `/test`, genuinely one-shot) → **`'5m'`** (cheaper 1.25× write, no
  later turn to amortize a longer TTL).

Haiku is carved out: `model.includes('haiku')` always takes the bare 5m marker even when the caller asks for
`'1h'` (haiku caching behaves differently; real Claude Code excludes it too).

**Why.** The old `convo.length >= 2 ? '1h' : '5m'` was a mis-port of openclaude's TTL idea. openclaude
latches 1h-eligibility **session-stable** precisely so the TTL can't change mid-session; deriving it from
this request's turn count does the opposite — a fresh bridged session sends **turn 1 at 5m** (`convo.length
=== 1`) then **turn 2 at 1h** (`>= 2`). A TTL flip rewrites `cache_control`, which busts the server-side
prompt cache, so turn 2 of **every** session re-writes the whole system+tools prefix at the 2× rate instead
of reading turn 1's entry. The turn-count proxy also can't tell a one-shot Inquire from turn 1 of a long
session — both have `convo.length === 1`. Fixing the TTL at the call site removes the flip and labels each
path correctly. (1h TTL needs no beta header — openclaude sends `ttl:'1h'` with only the standard betas.)

**What did NOT change.** The breakpoint *placement* from #111 is untouched: last-system-block marker (covers
tools) + the walk-back message markers (≤4/request, ~15-block step for the ~20-block lookback). Only the TTL
value carried by those markers moved from turn-count to call-path.

**Also added.** `anthropicCacheOutcome(usage, turnCount)` — a pure classifier (`hit`/`fresh`/`miss`/`none`)
over the usage the wire already reports; the Bridge's Anthropic door logs a one-line `prompt-cache MISS …`
via `deps.log` when a past-first-exchange request read nothing from cache while billing a large uncached
input. This is the observability the #111 regression previously had none of (real Claude Code has a whole
`promptCacheBreakDetection` subsystem; this is the minimal proxy-side signal).

**Reversibility.** Easy (one arg + two call sites), but reverting to turn-count reintroduces the per-session
turn-2 cache bust. Treat the fixed-per-path TTL as load-bearing.

## Related
- [[decisions]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[gotchas]]
