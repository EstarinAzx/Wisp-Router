---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**TUI ops batch (spec #120) implemented — #121/#122/#123 all closed.** Relay chain
(leg 1, 3 firings, one ticket each) ran to goal and stopped itself. Three commits on branch
**`tui-ops-batch`** (NOT main — user override; unmerged, unpushed):
`71fc0f6` /bridge ensure-on + off-only stop · `b53b1af` /show-log ring buffer + Log Screen
(scrollbox stickyScroll) · `92b6023` headless `wisp providers`/`wisp models` (core
discoveryCli seam + renderer-free modelFetch extraction). Every ticket gated: core vitest
(473) + tsc both packages + tui bun test (13) + sandbox-home verify of the real App/entry
points. Breadcrumb comments on all three issues.

## Next task

**None queued — batch landed and released.** Same session continued past the chain:
`tui-ops-batch` fast-forwarded into main, `a98fa15` = chore(release): 2.0.13, tag `v2.0.13`
pushed, release run 29563170826 green (4 platforms + publish), `npm view wisp-router version`
→ 2.0.13, spec #120 closed, branch deleted. One late `npm view` re-check remains prudent
([[gotchas]] — spam filter has removed green publishes hours later). Open candidates: #124
(wisp-slot session-awareness, parked ready-for-human), backlog #68/#69, or a fresh `/preset
init` idea.

## Landmines

- Any NEW native `<select>` must spread **both** `SELECT_COLORS` and `SELECT_MOUSE` (homes:
  `src/theme.ts` + `src/widgets.tsx`). SELECT_MOUSE is `<select>`-only — scrollbox panels
  (Log Screen) use native stickyScroll instead, nothing to spread.
- `SELECT_MOUSE` + the new logBuffer sticky tests read opentui privates/behavior, dep pinned
  exact 0.4.3 — any `@opentui/*` bump must re-run `bun test` in `packages/tui`
  ([[select-mouse-leans-on-opentui-privates]]).
- Headless command paths stay renderer-free — no Screen-module imports; model fetch lives in
  `packages/tui/src/modelFetch.ts` (throwing) with the swallowing wrapper for pickers.
- Tag must equal `packages/tui/package.json` version or release.yml refuses.
- PowerShell env checks lie about bridging — use Bash
  ([[powershell-profile-env-masks-session-env]]).
- Relay/loop state (`.claude/loop-arg.md`, `.claude/relay/loop-arg.md`) is gitignored and both
  now carry `stop: true` — a fresh `/relay N=… /preset loop-arg` re-seeds cleanly.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-17-bridge-idempotent-on-showlog-panel-command-first-headless-cli]]
