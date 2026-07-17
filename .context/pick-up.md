---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**#124 shipped and closed — wisp-slot 1.1.0 session-awareness.** Two commits on
`main` (unpushed): `c7ca050` plugin SKILL.md sync (step-6 agent-label rule) ·
`0a2e2d5` SessionStart hook (announcement + routing snapshot + CLI cheat sheet +
stale-lease warning, silent unbridged) + statusline badge (`[WISP fable→<model>]`
live, `!LEASE`, `[WISP]` fallback) + README + 1.1.0. Verified: 8-case fixture
matrix on sandbox `WISP_HOME` + wrapper e2e. Machine wired: personal skill copy
retired to `_deprecated/`, plugin installed from local directory marketplace,
elucidate statusline wrapper runs the badge from the checkout. Vault + gotcha +
decision entry all synced. Breadcrumb comment on #124.

## Next task

**None queued.** Candidates: backlog #68/#69, or a fresh `/preset init` idea.
Main is 2 commits ahead of origin — push when convenient (no release needed;
#124 touched no package code, npm stays 2.0.13).

## Landmines

- `plugins/slot/**` edits DON'T reach the live plugin until
  `claude plugin update wisp-slot` — directory marketplace installs a versioned
  cache. Exception: the statusline badge runs from the checkout (live edits).
  See [[slot-skill-has-two-copies-personal-vs-plugin]] (rewritten — plugin-only now).
- Bridged detection = `ANTHROPIC_BASE_URL` set AND `~/.wisp` exists; never env
  alone ([[powershell-profile-env-masks-session-env]] — PowerShell profile trap).
- First bridged session after this will show the new hook context + `[WISP …]`
  badge — that's the live eyeball test if anything looks off.
- Tag must equal `packages/tui/package.json` version or release.yml refuses
  (standing rule, next release).

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-17-slot-plugin-only-session-awareness-hook-badge]]
