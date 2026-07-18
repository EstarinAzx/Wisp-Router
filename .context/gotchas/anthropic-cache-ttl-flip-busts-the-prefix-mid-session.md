---
type: gotcha
project: wisp
updated: 2026-07-18
tags: [context, gotcha]
---

# A cache-control TTL flip mid-session busts the whole prefix — never derive TTL from turn count

Anthropic keys a prompt-cache entry on its `cache_control` (including the `ttl`). Change the TTL between two
requests of the SAME session and the second request can't read the first's entry — it re-writes the whole
cached prefix (system + tools, often 10–20K tokens) at the 2× rate. Real Claude Code latches 1h-eligibility
session-stable for exactly this reason.

**The trap we shipped and fixed (2026-07-18):** `buildAnthropicMessagesBody` used to pick the TTL from
`convo.length` — `>= 2 ? '1h' : '5m'`. A fresh bridged session's turn 1 has one turn (5m); turn 2 has three
(1h). So turn 2 of *every* session flipped 5m→1h and re-billed the prefix uncached. The fix fixes the TTL at
the call PATH: `anthropicStream` (sessions) → `'1h'`, `anthropicInquire` (one-shot) → `'5m'`, haiku always
5m. See [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]].

**Rule of thumb:** the TTL for a given conversation must be constant for its whole life. If you ever make it
conditional again, condition it on something stable across the session (the call path, a latched flag) —
never on this request's message count. The `prompt-cache MISS` line the Bridge now logs (via
`anthropicCacheOutcome`) is the tripwire if it regresses.

## Related
- [[gotchas]]
- [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
