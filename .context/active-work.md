---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Fable 5 (auto)._
_At commit: c0351fb on `main`. Working tree: CONTEXT.md header fix uncommitted (this wrap-up commits it)._

## Current focus
**TUI UX batch v2 — planned, not yet implemented.** Planning-only session: v2.0.2 release
verified landed, then the init funnel (grill → spec → tickets) produced GitHub issues
**#78 (spec)** + **#79–#82 (slices, all `ready-for-agent`, zero blockers)**.

## State
- **Done this session (no code changes):**
  - **Release verified:** v2.0.2 workflow green, `npm view wisp-router version` → 2.0.2,
    platform package probe 200.
  - **Grill settled 8 UX items** → spec #78. Key decisions: `/routing` splits into two display
    sections (Claude Code = 4 Family routes, Custom = Aliases); alias-only default flips ON at
    read time with a zero-alias Provider-row fallback in the Bridge list; new `/modelids [on|off]`
    twin of `/aliasonly`; `/bridge` screen reuses the existing project-scoped settings.json
    snippet builder (PRD #43 standing decision — global `~/.claude/settings.json` stays absent).
  - **Tickets published:** #79 `/routing` overhaul · #80 `/bridge` guidance + status redesign ·
    #81 alias-only default + fallback + nudge · #82 `/help` + `/modelids`.
  - **CONTEXT.md:** TUI section header fixed ("planned, not yet built" → shipped 2.x).
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
Work the frontier — all four tickets unblocked. Recommended first: **#81** (core-seam,
tested; the default-flip story the other UX rides on). Single ticket: `/preset scope 81`.
Whole batch: `/loop /preset ticket-loop`. Backlog #68 (chat mode) / #69 (copilot-wisp) still
deferred behind this batch.
Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`;
VS Code extension 1.7.0 release (CHANGELOG Unreleased ready); root `.vsix` pile (ask before
purging); panel-side alias rename (TUI-only today); `.claude/settings.local.json` snippet
switch (spec #78 out-of-scope note).

## Skills for next session
- /preset scope — entry gate for the picked ticket, or /loop /preset ticket-loop for the batch.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.
- (carried) npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI; the shim's release-download fallback keeps installs working.
- (carried) npm token was pasted in-session previously — user should rotate it (repo secret `NPM_TOKEN`).
- (carried) Codex signed out on this machine — `/signin codex` before Codex live checks.

## Recent context
- Ticket #81 seam: the effective alias-only read must land at the shared seam ALL consumers use
  (Bridge list + TUI echo + panel checkbox agree); stored explicit `false` respected, no
  migration writes.
- Ticket #80 seam: reuse `buildClaudeCodeSnippets` verbatim — no second snippet source.
- Tests: `bun run test` at root → `packages/core/tests/` (369). Core typecheck ignores tests.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).
- TUI 2.0.2 runtime still not eyeballed in a real terminal (carried from last session).

## Related
- [[overview]]
- [[stack]]
- [[decisions]] — new entry: alias-only default ON
- [[gotchas]]
- [[pick-up]]
