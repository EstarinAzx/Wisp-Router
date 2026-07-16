---
type: gotcha
project: wisp
updated: 2026-07-17
tags: [context, gotcha]
---

# PowerShell profile env masks the real session env (bridged-detection trap)

The PowerShell tool sources the user profile, which sets `ANTHROPIC_BASE_URL` (and
`CLAUDE_BINARY`) — so a PowerShell env check inside ANY Claude Code session claims the session
is bridged even when it runs plain `claude` on Anthropic auth. Bit us live (2026-07-17):
an entire "bridged" e2e proof ran against real Anthropic because the check trusted PowerShell.

Rule: to know whether the *session* is bridged, read env from a shell that skips profiles —
the Bash tool (`echo "$ANTHROPIC_BASE_URL"`) — or watch whether the Bridge host's log scrolls
on the session's own turns. PowerShell answers "what does the profile set", not "what is this
process's env".

## Related

- [[gotchas]] — index
