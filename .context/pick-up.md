---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Bridge Routing map fully planned — zero code yet.** `/preset init` funnel ran end-to-end:
grilled design → glossary terms (Routing map / Family route / Alias / Target in `CONTEXT.md`) →
MVD (`.context/happy-path.md`, "Bridge Routing map" section) → **PRD issue #50** → tickets
**#51 → #52 → #53** (linear chain, all `ready-for-agent`). Design core: name resolves
Provider id → Alias → Family route → Active; Target = Provider + pinned model; both doors;
fail-loud; aliases in `GET /v1/models`; no wildcards.

## Next task
1. **`/preset scope 51`** — "Family routes end to end", first unblocked slice. Fresh `feat/`
   branch off main. Resolver is built COMPLETE in this slice (incl. alias logic + full decision-table
   tests); panel rows use free-text model fields (dropdowns are #53).
2. Then #52 (Aliases + models list), #53 (per-row dropdowns) — or `/loop /preset ticket-loop`.
3. After the routing map ships: **TUI PRD for Wisp** via `/preset init` (user-stated order).

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Panel model lists currently serve the **Active Provider only** — per-row lists are deliberately
  deferred to #53; don't pull that plumbing into #51/#52.
- Three global skills (grill-with-docs, to-spec, to-tickets) had `disable-model-invocation` flipped
  to `false` this session — sync the ecosystem-kb vault before any template push (`/preset health`).
- **v1.5.0 is still a pre-release**; v1.5.1 packaging remains undone by choice.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
