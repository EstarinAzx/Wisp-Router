---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#51 Family routes end to end — built, reviewed, demo-verified.** Commit `f9c0519` on
`feat/routing-map-family-routes` (local only, NOT pushed). Pure resolver `src/routing.ts` complete
(id → alias → family → active, alias logic included ahead of #52) + 14-test decision table; both
Bridge doors route through it with pinned-model override + per-request log line; map in globalState
`wisp.routingMap`; panel has the four Family rows. Suite 296/296. Demo log:
`[bridge] route family 'claude-sonnet-5' -> codex model=gpt-5.6-sol`.

## Next task
1. **`/preset ship`** — push the branch, open the PR for #51, merge it.
2. **`/preset scope 52`** — "Aliases + models list": panel add/remove Alias rows (name + Target;
   refuse an Alias shadowing a Provider id) + advertise aliases in both doors' `GET /v1/models`
   (`buildModelsList` in `bridge.ts`, `buildAnthropicModelsList` in `bridgeAnthropic.ts`). Resolver
   unchanged — alias lookup already shipped + tested.
3. Then #53 (per-row dropdowns), then TUI PRD via `/preset init`.

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Routing-map Targets store raw provider ids with no rename migration (deliberate skip) — if a
  Provider id ever gets renamed, add the map to the migration pass or the family 404s.
- Panel model lists serve the Active Provider only — per-row lists stay deferred to #53.
- **v1.5.0 is still a pre-release**; v1.5.1 packaging remains undone by choice.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
