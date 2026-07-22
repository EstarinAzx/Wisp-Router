---
type: gotcha
project: wisp
updated: 2026-07-22
tags: [context, gotcha]
---

# Advisor mode forks the cache prefix into two variants (aux forks, not user toggles)

Advisor mode appends the synthetic `advisor` tool to the request's tools array, and tools sit inside the
Anthropic cached prefix. But the thing that alternates advisor-on/advisor-off within one conversation is
**not the user** and **not wisp** — it's Claude Code's own auxiliary fork queries (#160, resolved
2026-07-22). Auto-memory extraction (`querySource:"extract_memories"`), compact, agent_summary etc. fork
the main conversation verbatim (`cacheSafeParams` copies model/params/history so the fork should ride the
main cache), but Claude Code injects the `advisor_20260301` tool only for querySources
`repl_main_thread*` / `agent:*` / `sdk` / `hook_agent` — auxiliary classes never carry it. So with the
advisor enabled, every aux fork is a second prefix variant sharing one history: the FIRST fork after the
conversation has grown re-writes the whole prefix uncached (live-captured 2026-07-22: ~95K tokens,
`read=0 creation=95299`), and afterwards each variant re-bills the history delta the other already paid
for. Both variants stay warm, so bills look healthy — the money leaks only at growth spurts.

Recognition marks (post-#158/#159 the STALE noise is gone; this is what remains):

- `MISS (server) … read=0 creation≈<full context>` on a request line **without** the `advisor=` suffix,
  while neighboring main-loop lines carry it → an aux fork, not a cache regression.
- The fork's usage appears in **no transcript** (`skipTranscript`) — don't hunt the 95k in JSONLs.
- A lone `effort=high` request in the no-advisor cluster is the same shape: aux requests run at the
  model's `default_effort` (high for fable-5) instead of the session override.
- Extraction is agentic (`maxTurns:5`, reads the memory dir) → a *cluster* of no-advisor lines, not one.

Knobs: disable auto-memory for long cost-sensitive bridged sessions, or run without the advisor. Nothing
wisp-side to fix — the door is a faithful echo of the wire (`parsed.advisor` is a pure read of inbound
tools). Upstream mitigation exists but is feature-gated off (`skipCacheWrite` behind `tengu_basalt_spur`;
`agent_summary` already hard-codes it on). Full evidence chain on
[#160](https://github.com/EstarinAzx/Wisp-Router/issues/160).

**Rule of thumb:** advisor state is session-stable from the user's side; per-request flapping in the logs
is Claude Code's background machinery. Like the TTL trap in
[[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]], the fix is recognizing the shape, not chasing it.

## Related
- [[gotchas]]
- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]
- [[claude-code-advisor-is-endpoint-gated-past-the-bridge]]
