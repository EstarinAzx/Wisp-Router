---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**TUI UX batch v2 SHIPPED + 2.0.3 tagged.** Ticket-loop ran the whole frontier: #81 (PR #83,
alias-only default ON + zero-alias fallback + nudge), #79 (PR #84, `/routing` sections), #80
(PR #85, `/bridge` connect screen), #82 (PR #86, `/help` + `/modelids`). All merged, issues
closed with breadcrumbs; #78/#57 relabeled `ready-for-human` — agent queue EMPTY. Real-terminal
eyeball caught a broken `/bridge` layout (rows overlaying) → fixed on main (1830600). Release
`v2.0.3` tagged and pushed.

## Next task
**Verify release 2.0.3, then eyeball the fixed `/bridge` screen.**
1. `gh run view 29383784428` → expect green (was `in_progress` at wrap-up).
2. `npm view wisp-router version` → 2.0.3; platform probe if suspicious (see landmines).
3. Real terminal: `/bridge` screen must read clean now — status dot, doors/secret, claude-wisp
   line, settings.json block, two short dim lines. Fix was NOT visually verified.
Then: backlog #68 (chat mode) / #69 (copilot-wisp), or the small orphans in active-work.

## Landmines
- opentui overlays rows following any >~70-col wrapping row; bare map arrays between siblings
  misposition rows. Rule + fix pattern inline atop the `/bridge` JSX in `packages/tui/src/app.tsx`.
- npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI.
- User should still rotate the npm token (repo secret `NPM_TOKEN`).
- Codex signed out on this machine — `/signin codex` before Codex live checks.
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes
  real `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- PowerShell 5.1 mangles multi-line `git commit -m` — use `git commit -F <file>` (or Bash heredoc).
- Tests are 376 now; `bun run test` at root.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
