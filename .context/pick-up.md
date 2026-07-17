---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**Select mouse interactivity + release v2.0.12.** opentui selects were keyboard-only; now
thumb-column drag scrubs, wheel steps, row click selects (`SELECT_MOUSE` in
`packages/tui/src/widgets.tsx`, spread into all 8 `<select>`s) — `b38b53e` + `6dd4bbf` +
`0b0faeb`, tested by `packages/tui/tests/selectScrollDrag.test.ts` (first TUI bun tests).
Release commit `cc75a1d` bumped 2.0.12 + re-embedded the span baseline; tag `v2.0.12` pushed.

## Next task

**Babysit the v2.0.12 release run.** `gh run list --workflow=release.yml` → the run for tag
`v2.0.12` must go green (4 platform builds + publish). Then verify
`npm view wisp-router version` returns `2.0.12` — and check again later: the npm spam filter
has removed green publishes minutes after ([[gotchas]] → npm spam filter). If a platform
package 403s, that's best-effort by design (the shim falls back to the GitHub release
download); only the thin shell hard-fails. Good fit for `/loop /preset ci-babysit`.

## Landmines

- Any NEW native `<select>` must spread **both** `SELECT_COLORS` and `SELECT_MOUSE` (homes:
  `src/theme.ts` + `src/widgets.tsx`).
- `SELECT_MOUSE` reads opentui privates, dep pinned exact 0.4.3 — any `@opentui/*` bump must
  re-run `bun test` in `packages/tui` ([[select-mouse-leans-on-opentui-privates]]).
- `bun run spans --update` only ever rides a version bump — never a move-only change.
- Tag must equal `packages/tui/package.json` version or release.yml refuses.
- Screen modules import from `./modes`/`./theme`/`./widgets`/`./providerScreens` — never from
  the shell (circular).
- Slot skill exists TWICE — personal `~/.claude/skills/slot` vs repo `plugins/slot`; fixes go
  to both ([[slot-skill-has-two-copies-personal-vs-plugin]]).
- Never restore a Slot while its agent runs ([[accidental-tui-open-rewrites-all-family-routes]]).
- PowerShell env checks lie about bridging — use Bash
  ([[powershell-profile-env-masks-session-env]]).

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
