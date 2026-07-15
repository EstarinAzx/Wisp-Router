---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Fable 5 (auto)._
_At commit: de0b048 on `main`. Working tree: clean (this wrap-up commits only `.context/`)._

## Current focus
**TUI UX batch v2 — SHIPPED, release 2.0.3 in flight.** Ticket-loop session: all four spec-#78
slices implemented, reviewed, merged (PRs #83–#86); a real-terminal eyeball caught a broken
`/bridge` layout, fixed on main; v2.0.3 tagged — Release workflow was still `in_progress` at
wrap-up time (run 29383784428).

## State
- **Done this session:**
  - **#81** (PR #83): `effectiveAliasOnly()` in core `home.ts` — alias-only defaults ON at read
    time, stored `false` respected, no migration writes; zero-alias fallback lives INSIDE
    `buildAnthropicModelsList` (new `aliasOnly` param); `/aliasonly` refuse-guard dropped;
    post-provider-select `/routing` nudge.
  - **#79** (PR #84): `/routing` overview (intro + Claude Code / Custom sections), new
    `routing-section` mode, Esc steps one level (sub-screen → section → overview → palette);
    alias picker leads Rename/Remove — gated on the alias existing (review catch: add-alias flow
    reaches the picker pre-persist; ungated verbs dead-end or lie).
  - **#80** (PR #85): `/bridge` connect screen — status header, `claude-wisp` per-session line,
    project-scoped settings.json trio via `buildClaudeCodeSnippets` (one snippet source).
  - **#82** (PR #86): `/help` (scrollable select over `SLASH_COMMANDS`; Enter/Esc close only) +
    `/modelids [on|off]` (twin of `/aliasonly` over `aliasPickerShowsModel`); ambiguous partials
    now name candidates (`/mode` → /model or /modelids); registry order pinned by test.
  - **`/bridge` layout fix** (1830600, straight on main): real-terminal eyeball showed rows
    overlaying from the Connect section down — opentui overlays rows after any >~70-col wrapping
    row, and a bare map array between siblings mispositions rows. Rule now inline in app.tsx:
    short single-purpose rows, maps in their own column box.
  - **Tracker triage:** #78 (spec) + #57 (PRD) relabeled `ready-for-human` (label created) —
    `ready-for-agent` queue is EMPTY. All four slice issues closed with breadcrumbs.
  - **Release:** `chore(release): wisp-router 2.0.3` + tag `v2.0.3` pushed.
  - `.gitignore`: `.obsidian/` added (user edit, committed).
- **In flight:** Release workflow run 29383784428 (v2.0.3) — unverified at wrap-up.
- **Blocked:** nothing.

## Pick up here
1. **Verify 2.0.3 landed:** `gh run view 29383784428` green → `npm view wisp-router version` →
   2.0.3 → platform probe (see Open questions). Then eyeball the FIXED `/bridge` screen in a real
   terminal (`npm i -g wisp-router@2.0.3` or `packages/tui; bun run dev`) — the fix itself is
   unverified visually.
2. Then the backlog: #68 (chat mode) / #69 (copilot-wisp), or the small orphans below.

Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`;
VS Code extension 1.7.0 release (CHANGELOG Unreleased ready); root `.vsix` pile (ask before
purging); panel-side alias rename (TUI-only today); `.claude/settings.local.json` snippet
switch (spec #78 out-of-scope note).

## Skills for next session
- /preset catch-up if the pick-up note is stale; otherwise /preset pick-up → verify release.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.
- (carried) npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI; the shim's release-download fallback keeps installs working.
- (carried) npm token was pasted in-session previously — user should rotate it (repo secret `NPM_TOKEN`).
- (carried) Codex signed out on this machine — `/signin codex` before Codex live checks.
- `/modelids` inlines `?? true` as a third scattered reader of `aliasPickerShowsModel` — fine
  while defaults agree; a #81-style shared seam only if that default ever flips.

## Recent context
- Tests now **376** (`bun run test` at root → `packages/core/tests/`). Core typecheck ignores tests.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).
- opentui layout trap: see the comment atop the `/bridge` JSX in `packages/tui/src/app.tsx`.
- Repo now has `ready-for-human` label; ticket-loop breadcrumbs are on issues #79–#82.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
