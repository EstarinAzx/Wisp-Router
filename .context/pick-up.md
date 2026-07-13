---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**The whole Routing map arc shipped + v1.6.0 released.** PRs #54 (#51 family routes + vision fix),
#55 (#52 aliases + advertising), and the #53 release PR all merged to main. #53 = per-row model
dropdowns (OAuth kinds from models.dev, keyed kinds live-fetched with the row Provider's own key,
silent free-text fallback), demo-verified by user. Release chores: version 1.6.0, CHANGELOG entry,
README rewritten whole (repo URL → Wisp-Router, Routing map section, new setting documented), fresh
`.vsix` packaged and attached to GitHub release v1.6.0.

## Next task
**TUI PRD for Wisp** via `/preset init` — a fresh idea, so run the full front door: grill-me
interview → `/hp` MVD → to-spec → to-tickets. Nothing else queued; the tracker's routing-map arc
(#50–#53) is closed.

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Claude Code fetches `/v1/models` at startup only — alias/toggle edits need a Claude Code restart.
- Git trap seen once: commit meant for a fresh branch landed on local main — check
  `git branch --show-current` before committing.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
