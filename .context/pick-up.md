---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Planning only — TUI UX batch v2 specced and ticketed (no code changes).** Verified the v2.0.2
release landed (workflow green, npm 2.0.2, platform pkg probe 200). Ran the init funnel: grill
settled 8 UX items → spec **#78** → four vertical slices **#79–#82**, all `ready-for-agent`,
zero blockers. Load-bearing decision recorded in [[decisions]]: alias-only defaults ON at read
time + zero-alias Provider-row fallback. CONTEXT.md TUI header fixed (planned → shipped).

## Next task
Work the frontier — all four tickets are unblocked:
1. **#81** alias-only default ON + fallback + `/routing` nudge — recommended first (core-seam,
   tested; effective read must land at the ONE shared seam so Bridge list + TUI + panel agree).
2. **#79** `/routing` overhaul (sections Claude Code/Custom, intro line, picker order).
3. **#80** `/bridge` connect guidance (reuse `buildClaudeCodeSnippets` verbatim) + status redesign.
4. **#82** `/help` + `/modelids [on|off]`.
Single ticket: `/preset scope 81`. Whole batch: `/loop /preset ticket-loop`.

## Landmines
- **#80 snippet decision:** project-scoped `.claude/settings.json` only — the global
  `~/.claude/settings.json` form is deliberately absent (PRD #43: highest precedence, reroutes
  every session). Don't "improve" it back in; `.claude/settings.local.json` switch is a separate
  future ticket (out-of-scope note in #78).
- **#81:** no migration writes — read-time `?? true` only; stored explicit `false` stays.
- TUI 2.0.2 runtime still not eyeballed in a real terminal (typecheck + 369 tests only).
- npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI.
- User should still rotate the npm token (repo secret `NPM_TOKEN`).
- Codex signed out on this machine — `/signin codex` before Codex live checks.
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes
  real `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- PowerShell 5.1 mangles multi-line `git commit -m` — use `git commit -F <file>`.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
