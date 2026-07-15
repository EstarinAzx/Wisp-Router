---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Wisp TUI arc (PRD #57)

**Decision:** the Wisp TUI becomes the face and only config surface of Wisp; the extension
shrinks to VS Code chat routing (v2.0.0, panel + Inquire removed); the Bridge (both dialects)
moves to `wisp serve`; a `claude-wisp` bin launches Claude Code pre-wired (env on child only,
verbatim arg passthrough, fail-friendly when the Bridge is down). Structural choices are ADRs:
monorepo bun workspaces (ADR-0001), secrets to `~/.wisp/auth.json` retiring SecretStorage
(ADR-0002), opentui + Bun compiled binaries as npm `wisp-router` with bins `wisp`/`claude-wisp`
(ADR-0003).
**Why:** Wisp's best doors (Claude Code, Copilot CLI, OAuth subscriptions) are terminal tools —
the config surface was welded to an editor they don't need; the engine was already vscode-free.
**Reversibility:** the shrink ships as a major version — restoring the panel later would be a
rewrite, treat as one-way. Non-ADR calls: TUI input = slash palette, never chat (`/test` is the
one canned-prompt exception; chat mode = backlog #68); no daemon — `wisp serve` is just the
process without a face; extension shrink gated on TUI parity (#61+#63+#65) so there is never a
moment nothing can configure Wisp.

## Related

- [[decisions]] — index
