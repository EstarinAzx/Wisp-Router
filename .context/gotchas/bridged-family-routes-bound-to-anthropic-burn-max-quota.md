---
type: gotcha
project: wisp
updated: 2026-07-16
tags: [context, gotcha]
---

# Family routes bound to `anthropic` bill the Claude Max plan — even "GPT sessions"

The Anthropic Provider is the user's own Claude.ai OAuth subscription — traffic through the
Bridge to it is indistinguishable from native Claude Code on Anthropic's side, so it draws
the SAME 5-hour/weekly Max limits. Two traps:

1. **Background chores.** Claude Code emits `claude-haiku-*` calls (titles, summaries) no
   matter what `/model` is set to. If the haiku Family route points at `anthropic`, a
   session running entirely on a Codex alias (`sol`/`terra`/`luna`) still burns Max quota in
   the background. Rebind haiku to a non-Anthropic Target to make a session truly
   Anthropic-free.
2. **"Through Wisp" ≠ "free".** All four family routes pointing at `anthropic` (the user's
   default config) means every bare `claude-*` id lands on the Max plan. Only non-Anthropic
   Targets (Codex = ChatGPT sub, OpenCode Go/Groq/etc. = API keys, xAI = Grok sub) are on
   separate meters.

Caching note: since #111 the Anthropic path carries cache breakpoints, so bridged usage
weighs like native (~0.1x on the cached span) — but it still bills the Max plan.

## Related
- [[gotchas]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
