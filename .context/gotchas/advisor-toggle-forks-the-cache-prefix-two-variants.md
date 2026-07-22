---
type: gotcha
project: wisp
updated: 2026-07-22
tags: [context, gotcha]
---

# An advisor on/off toggle mid-session forks the cache prefix into two variants

Advisor mode appends the synthetic `advisor` tool to the request's tools array, and tools sit inside the
Anthropic cached prefix. So a conversation whose requests alternate advisor-on/advisor-off is really two
prefix variants sharing one history: the FIRST flip re-writes the whole prefix uncached (live-captured
2026-07-22: ~95K tokens, `read=0 creation=95299`), and every later flip re-bills the history delta
accumulated while the other variant was active. Both variants stay warm afterward, so bills look healthy —
the money leaks only at flips.

Second-order noise: the server-diagnosis chain keys on model + first user turn only, so both variants share
one chain. Each flip makes the server compare against the other variant's message → spurious
`system_changed` verdicts, which the bill contradicts → downgraded to STALE advisory lines whose canned
"concurrent send" explanation misattributes the cause. Tickets: #158 (variant-aware chain key), #159 (STALE
wording), #160 (who drops the advisor field mid-session — unresolved).

**Rule of thumb:** advisor state should be session-stable, like the cache TTL in
[[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]. A `STALE ... reason=system_changed` line right
after a request whose log line lost its `advisor=` suffix is this shape, not a cache regression.

## Related
- [[gotchas]]
- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]
- [[claude-code-advisor-is-endpoint-gated-past-the-bridge]]
