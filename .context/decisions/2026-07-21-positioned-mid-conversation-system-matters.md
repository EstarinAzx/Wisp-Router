---
type: decision
project: wisp
date: 2026-07-21
tags: [context, decision]
---

# Positioned mid-conversation system matters — hoisting is a cache amplifier

**Decision:** Mid-conversation `role:system` turns must keep their chronological
position through the Anthropic door. The #46 deferral ("mid-conversation system
loses its position among turns — fine for the translator") is overturned: fine
for correctness, catastrophic for caching. Fix tracked as #145; guard
observability gap as #146.

**Why:** Cross-session transcript evidence (2026-07-20/21): bridged sessions
re-bill their entire conversation history at the stable-prefix boundary every
~7 requests (8–11 events/session, 0.6–1.2M tokens each session) vs ~every 71
requests native (TTL/compaction only). Mechanism: the parse folds mid-session
system blocks into the #139 volatile suffix, which renders BEFORE the whole
message history — so each churny Claude Code reminder (skill discovery, task
nudges) diverges the prompt right after the marked prefix. Native keeps those
blocks near the tail. The #111 guard never logged any of it: `read > 0` →
`hit`, and every fallback read the 58k stable prefix.

**Reversibility:** The finding is data, not preference — re-check only if
Claude Code stops injecting mid-session system content or Anthropic caching
semantics change. The fix itself is a normal slice (revertible PR).

## Related

- [[decisions]]
- [[2026-07-20-system-split-at-client-marker]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
