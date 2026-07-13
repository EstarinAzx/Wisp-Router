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
1. **If the PR is still open:** merge it (branch: `feat/live-oauth-model-lists` → main). Consider a
   v1.5.1 release tag if the user wants it installable.
2. **Then the user's stated next thing: TUI PRD for Wisp** — run `/preset init` on it.
3. Queued idea from this session (file as issue/PRD before building): **claude-name routing map** —
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
