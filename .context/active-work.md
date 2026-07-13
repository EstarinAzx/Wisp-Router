---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: c1f63dc on `main` (docs: TUI groundwork), pushed._

## Current focus
**The Wisp TUI arc is fully staged, zero code written.** `/preset init` ran end to end: grill →
MVD → PRD [#57](https://github.com/EstarinAzx/Wisp-Router/issues/57) → tickets #58–#67
(`ready-for-agent`) + #68/#69 backlog. The TUI (opentui + Bun) becomes the face + only config
surface of Wisp; the extension shrinks to VS Code chat routing (v2.0.0); Bridge moves to
`wisp serve`; `claude-wisp` launcher added.

## State
- **Done this session:**
  - Grill settled every branch — see decisions.md 2026-07-14 entry + ADRs 0001–0003 (`docs/adr/`).
  - `CONTEXT.md`: TUI-era terms (Wisp TUI, Wisp home, wisp serve, claude-wisp) + third Provider
    kind (Anthropic) fixed.
  - `.context/happy-path.md`: fourth MVD — "Wisp TUI — install to bridged Claude Code".
  - PRD #57 published; tickets #58–#67 with real blocking edges; #68 (chat mode) + #69
    (copilot-wisp) as unlabeled backlog.
  - All docs committed to main (c1f63dc) and pushed.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**`/preset scope 58`** — TUI slice 1 (restructure: bun-workspaces monorepo, packages
core / vscode / tui). The only unblocked ticket; frontier then runs #59 → #60 → fan-out.
Read #58's body + ADR-0001 before planning.

## Skills for next session
- /preset scope — entry gate for ticket #58.
- superpowers:using-git-worktrees — restructure is a whole-repo move; isolate it on a branch.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.

## Recent context
- Ticket dependency shape: #58→#59→#60, then #61/#62/#63/#65 fan out from #60; #64 behind #63;
  #66 (extension shrink) gated on #61+#63+#65 (TUI must reach full panel parity first — no
  configuration gap); #67 (release) behind #64.
- npm names checked: `wisp` + `wisp-cli` taken; package is `wisp-router`, bins `wisp` +
  `claude-wisp`.
- opentui-on-plain-Node deliberately left unresolved — compiled binaries (ADR-0003) make it moot.
- OAuth two-process refresh races: spec answer is atomic writes + re-read-before-refresh on
  auth.json (acceptance criteria in #59).

## Related
- [[overview]]
- [[decisions]] — 2026-07-14 TUI-arc entry + ADR pointers
- [[happy-path]] — the new TUI MVD embedded in PRD #57
- [[gotchas]] — stale-build + dup-panel traps still apply while the extension is touched
