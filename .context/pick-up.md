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

**Land the branch, then tag the release.**
1. Merge decision: `tui-ops-batch` → main (direct merge or PR — solo repo, user's call;
   `/preset ship` opens the PR if wanted).
2. After merge: release = bump `packages/tui/package.json` version + `bun run spans --update`
   (version bump rides it — never move-only) + tag equal to that version or release.yml
   refuses. Re-check `npm view wisp-router version` after publish ([[gotchas]] — spam filter
   has removed green publishes).
3. Spec #120 closes when the batch ships; #124 stays parked ready-for-human.

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
