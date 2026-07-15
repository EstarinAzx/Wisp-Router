---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# The Bridge Anthropic door forwards Codex tools non-strict — external schemas can't be strict-coerced (#46)

Codex strict Responses tools demand a fixed closed shape; Claude Code's built-in tools (esp. `AskUserQuestion`'s
dynamic answer map) 400 under strict, one keyword at a time. The door sends `toCodexResponsesTools(tools, false)`
so the schema rides through verbatim. If you re-enable strict on any door path, expect `propertyNames` /
`required`-mismatch 400s from real Claude Code. See [[decisions]] 2026-07-13 (non-strict door tools).

## Related

- [[gotchas]] — index
