---
type: decision
project: wisp
updated: 2026-07-13
tags: [context, decisions]
---

# Bridge Anthropic door: Claude Code as a Bridge consumer (PRD #43, slices #44–#47)

**Decision:** Reopen PRD #34's "non-OpenAI wire formats" exclusion: the **Bridge** gains a second front door
speaking **Anthropic Messages** (`POST /v1/messages` SSE + `GET /v1/models`; `count_tokens` skipped — Claude
Code estimates locally) so Claude Code runs on any catalog Provider. Same listener, same secret (accepted as
`x-api-key` **or** `Bearer` — Claude Code sends either depending on which env var the user set). Routing
reuses the **already-live** loose fallback: Provider id → that Provider; unknown `claude-*` strings → the
active Provider. Everything else from #34 stands (embedded-in-extension-host, no credential egress, off by
default, image input out of scope).
**Terminal UX now vs later:** this PRD ships shapes (a)+(c) — Claude Code's **own `/model` picker** (fed by
discovery + `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`) plus a **side-panel copy-paste snippet** section
(per-session shell line default; project-scoped `.claude/settings.json` variant; the **global**
`~/.claude/settings.json` env block is banned — highest precedence, silently hijacks every session). The end
goal — a **standalone thin remote-control TUI** (openclaude repo as skeleton reference) and an opt-in env
auto-inject toggle — is **deferred to its own later PRD**: auto-injection Copilot-style was rejected *for
Claude Code today* because it would reroute sessions meant for the real Claude subscription.
**Why:** Claude Code only speaks the Anthropic protocol to `ANTHROPIC_BASE_URL` — no OpenAI-door path exists;
the subscription-backed providers (Codex OAuth headline) are unreachable by any other BYOK route. New PRD over
extending #34 because #34's out-of-scope line is load-bearing history; #34 closed as shipped.
**Gate:** slice #44 answers the one open unknown — whether the picker filters non-`claude-*` discovery ids
(fallback: `claude-wisp-<provider>` aliases + inbound strip) — plus records real wire shapes before the
translator is built.
**Reversibility:** easy/additive (a second route on the existing listener + one pure translator module) — no ADR.

## Related

- [[decisions]] — index
