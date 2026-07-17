---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (2.0.14 chore-batch session)._
_At commit: `de70b3b` on `main` (pushed; released tag `v2.0.14` = `de70b3b`)._

## Current focus

**2.0.14 shipped (npm + GitHub release green).** Queue empty; open candidates:
backlog #68/#69, or a fresh `/preset init` idea.

## State

- **In flight:** nothing.
- **Done this session (straight to main, solo-repo rule):**
  - `52c878e` — purple statusline badge (cyan 87 → xterm 141, nearest to the TUI
    accent `#a78bfa`); wisp-slot 1.1.2, plugin cache updated on this machine.
  - `153bfeb` — Bridge screen recommends the wisp-slot plugin (dim hand-wrapped
    nudge under the Claude Code lines, marketplace install line included).
  - `de70b3b` — release prep 2.0.14 + **new `packages/tui/CHANGELOG.md`** seeded
    with 2.0.11–2.0.14 (TUI releases were never changelogged; the vscode product
    changelog stays extension-versioned, folds only ≤2.0.10 — see decision).
  - Tag `v2.0.14` pushed; release.yml run 29568893110 green — `wisp-router@2.0.14`
    live on npm, binaries + GitHub release up.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Nothing queued — pick a backlog item or init a new idea.

## Open questions

- Elucidate's badge is also purple (badge row: caveman orange, elucidate purple,
  ponytail pink) — if the two purples clash side by side, shift the wisp shade.

## Recent context

- Verified this session: tsc clean, tui bun test 13 green, span-baseline
  recaptured for 2.0.14 + the new Bridge rows (32 Screens match), sandboxed
  `wisp routing`/`--json`, statusline fixture emits `\x1b[38;5;141m`.
- `plugins/slot/**` edits still need `claude plugin update wisp-slot@wisp-router`
  to reach the live plugin (statusline badge exempt — wrapper runs it from the
  checkout). Done for 1.1.2.
- Test suite totals: core vitest 473, tui bun test 13 (unchanged — this batch was
  UI/docs/plugin only).

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
