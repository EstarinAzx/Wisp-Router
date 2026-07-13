---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#52 Aliases + models-list advertising — built, TDD'd, demo-verified.** Four commits on the NEW
branch `feat/routing-map-aliases` (`02e8bde`..`f634a35`), stacked on the still-unpushed
`feat/routing-map-family-routes`. Panel Alias rows (add/remove, Provider-id-collision refused with a
visible message), both doors advertise aliases in `GET /v1/models` (raw on OpenAI, `claude-wisp-`
prefixed on Anthropic so picks round-trip), picker rows show `sol — <pinned model>` toggleable via
`wisp.bridge.aliasPickerShowsModel` (Settings + panel checkbox). Resolver untouched (#51 already
shipped it). Suite 300/300. User verified live in Claude Code's /model picker.

## Next task
1. **`/preset ship` ×2** — push + PR + merge `feat/routing-map-family-routes` FIRST (#51 slice 1 +
   vision bugfix), then `feat/routing-map-aliases` (#52). Two PRs, family branch is the base of the
   stack.
2. **`/preset scope 53`** — per-row model dropdowns in the Routing map (live model lists per picked
   Provider instead of free-text; plumbing deliberately excluded from #52).
3. Then TUI PRD via `/preset init`.

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Claude Code fetches `/v1/models` at startup only — alias/toggle edits need a Claude Code restart to
  show in the picker (the Bridge itself reads the map + setting live per request).
- Routing-map Targets + aliases store raw provider ids with no rename migration (deliberate skip).
- **v1.5.0 is still a pre-release**; packaging remains undone by choice.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
