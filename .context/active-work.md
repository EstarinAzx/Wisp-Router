---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (#124 session-awareness session)._
_At commit: `0a2e2d5` on `main` (unpushed; last released tag `v2.0.13` = `a98fa15`)._

## Current focus

**#124 shipped and closed — wisp-slot 1.1.0 session-awareness.** Queue empty again;
open candidates: backlog #68/#69, or a fresh `/preset init` idea.

## State

- **In flight:** nothing.
- **Done this session (straight to main, solo-repo rule):**
  - `c7ca050` — plugin SKILL.md synced with the live skill's step-6 agent-label rule
    (label spawned agents with the real backend model); wisp-slot 1.0.1.
  - `0a2e2d5` — #124 session-awareness: `plugins/slot/hooks/hooks.json` +
    `hooks/session-start.js` (bridged sessions get announcement + live routing
    snapshot fail-soft + headless CLI cheat sheet + stale-lease warning; silent
    unbridged; all SessionStart sources) and `plugins/slot/statusline/wisp-statusline.js`
    (`[WISP <family>→<model>]` live per refresh, `⚠LEASE` marker, `[WISP]` fallback,
    absent unbridged) + README wiring docs; wisp-slot 1.1.0. Verified by an 8-case
    fixture matrix against a sandbox `WISP_HOME` + real statusline-wrapper e2e.
  - Machine-side (outside repo): personal `~/.claude/skills/slot/` retired to
    `~/.claude/_deprecated/slot/`; marketplace `wisp-router` added as a **local
    directory marketplace** (the checkout); `wisp-slot@wisp-router` installed;
    elucidate's `statusline-wrapper.ps1` now captures statusline stdin and runs the
    wisp badge from the **checkout path**. Ecosystem-kb vault synced (its slot page,
    log, index).
- **Blocked:** None.

## Pick up here

See [[pick-up]]. Nothing queued — pick a backlog item or init a new idea.

## Open questions

- None.

## Recent context

- Repo edits under `plugins/slot/**` reach the live plugin only after
  `claude plugin update wisp-slot` — directory marketplaces install a versioned
  cache (`~/.claude/plugins/cache/wisp-router/wisp-slot/<ver>/`). The statusline
  badge is exempt (wrapper runs it from the checkout). See the rewritten
  [[slot-skill-has-two-copies-personal-vs-plugin]] gotcha.
- Bridged detection convention: `ANTHROPIC_BASE_URL` set AND Wisp home exists;
  never trust env alone ([[powershell-profile-env-masks-session-env]]).
- Test suite totals: core vitest 473, tui bun test 13 (unchanged — #124 was
  plugin-side only, no package code touched).

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
