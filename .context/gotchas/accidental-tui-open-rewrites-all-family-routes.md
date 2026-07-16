---
type: gotcha
project: wisp
updated: 2026-07-17
tags: [context, gotcha]
---

# Accidental TUI open from an agent can rewrite ALL family routes

Observed live (2026-07-17, #110 verification): a bridged Claude Code session ran `wisp routing
--json` on the old 2.0.10 global, which opened the interactive TUI instead of printing. Between
the open and the agent stopping the task, the TUI's quick-setup path fired and rewrote **all
four family routes** to `anthropic/claude-*` — silently combining with
[[bridged-family-routes-bound-to-anthropic-burn-max-quota]]. The session's later snapshot then
faithfully preserved the damaged state, so its restore "worked" while the map stayed wrong.

Rules: never let an agent invoke bare `wisp` when the TUI could open (2.0.11+ has real
`wisp routing` subcommands; older = use the source entry). After any accidental TUI open,
diff the whole map against known state before trusting a snapshot taken afterward.

## Related

- [[gotchas]] — index
- [[bridged-family-routes-bound-to-anthropic-burn-max-quota]]
