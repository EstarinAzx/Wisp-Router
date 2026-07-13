---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Live OAuth model lists SHIPPED to PR.** Branch `feat/live-oauth-model-lists`: Codex + Anthropic panel
dropdowns and picker caps now read models.dev live (newest-first), curated lists demoted to offline
fallback (refreshed with the 5.6 family + claude-sonnet-5). 282 tests green, demo-verified (Terra/Luna
+ Sonnet-5/Fable-5 in the dropdowns, messaging works, real ~1M window for 5.6). Spec + plan in
`docs/superpowers/`.

## Next task
_PR #49 MERGED to main (f531082); feature branch deleted. v1.5.1 release/packaging not done — tag only
when the user wants it installable._
1. **User-stated order: the claude-name routing map FIRST, then the TUI PRD.** Start the routing map as
   a fresh `feat/` branch off main, PRD/issue first via `/preset init`.
2. **Then the TUI PRD for Wisp** — `/preset init`, own branch.
3. The routing map, spelled out (from this session's discussion): **claude-name routing map** —
   panel-configurable per-family aliases so bare `claude-*` ids from bridged Claude Code (Opus/Sonnet/
   Haiku/Fable picks, /advisor, background haiku calls) route to a chosen Provider+model each, instead
   of all collapsing to the Active Provider. Payoff: advisor = real Opus while main = Codex; haiku
   chores = cheap model.

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- **Local `main` carries the spec/plan docs commits** (made before branching) — after the PR merges,
  a plain `git pull` on main reconciles; don't force anything.
- **v1.5.0 is still a pre-release** — promote after soak, or fold into v1.5.1 with this feature.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]]
