---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Cline ToS, and why Copilot/Cursor were dropped

Cline's ToS §2.2 bars use "to develop competing products… or otherwise to our detriment." Ship the Cline
Provider **user-supplied-key only** (never an embedded/shared/proxied key) + a one-line in-panel note
that the user owns their ToS compliance. **GitHub Copilot** and **Cursor** were dropped entirely —
Copilot's only path is reverse-engineered client impersonation (account-ban risk); Cursor's API is
shape-incompatible (no `/chat/completions`) and "auth-only" use means session-token piggybacking (ToS
violation). Don't re-add them as "OAuth providers" — OAuth doesn't fix *why* they fail. See the
2026-06-15 ADR.

## Related

- [[gotchas]] — index
