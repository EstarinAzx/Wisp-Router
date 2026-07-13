---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Anthropic-door vision bugfix — found, TDD'd, live-verified.** Two commits on
`feat/routing-map-family-routes` (still local, NOT pushed): `ab21c18` fixes both image drops
(inline attach omitted on the Anthropic provider path in `bridgeServer.ts` `startProviderStream`;
Read-on-image `tool_result` images dropped for ALL providers in `bridgeAnthropic.ts`
`splitUserBlocks` — now hoisted into the turn's `images[]`), `8d6be05` adds the `images=N`
per-request log observable. Suite 297/297. User verified live: Anthropic-bound model reads inline
attach; codex path proven never-broken (`images=1` logged — GPT calling Read anyway is model habit,
see [[gotchas]] 2026-07-14 entry).

## Next task
1. **`/preset ship`** — push the branch, open ONE PR covering #51 (Routing map slice 1, `f9c0519`)
   + the vision fixes, merge it.
2. **`/preset scope 52`** — "Aliases + models list": panel add/remove Alias rows (name + Target;
   refuse an Alias shadowing a Provider id) + advertise aliases in both doors' `GET /v1/models`
   (`buildModelsList` in `bridge.ts`, `buildAnthropicModelsList` in `bridgeAnthropic.ts`). Resolver
   unchanged — alias lookup already shipped + tested.
3. Then #53 (per-row dropdowns), then TUI PRD via `/preset init`.

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- "Model can't see image" reports: check the door log's `images=N` BEFORE touching code —
  `0` = client never sent pixels, `>0` = look downstream. Full trap in [[gotchas]].
- Routing-map Targets store raw provider ids with no rename migration (deliberate skip) — if a
  Provider id ever gets renamed, add the map to the migration pass or the family 404s.
- **v1.5.0 is still a pre-release**; v1.5.1 packaging remains undone by choice.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
