---
type: pick-up
project: wisp
updated: 2026-07-20
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE):** 2.0.24 planned end-to-end — grill settled the design,
spec published as **#126**, six `ready-for-agent` slices **#127–#132**
(#131 blocked by #127; #132 blocked by all). Decision recorded:
[[2026-07-20-row-based-routing-snapshots-cli]]. No code written.

**Next task:** run the chain —

```
/relay N=1 /preset ticket-loop
```

State file already seeded at `.claude/relay/ticket-loop.md` (dynamic pacing,
N=1 → ONE issue per leg, fresh session each ticket; relay boot re-reads
`.context/overview.md` + `active-work.md` every leg). Frontier: #127 first,
then #128/#129/#130 in any order; #131 unblocks after #127; #132 last.

**Landmines:**

- #127 seam = mirror the routing-CLI pattern: pure core decision fn
  (argv + map + snapshot store → lines/exit/next state), thin TUI wrapper,
  one argv dispatch branch. Don't invent a second seam.
- Revert is unconditional-write + print-what-it-overwrote — no
  compare-and-set. Refuse-if-held is the safety rail, no `--force`.
- #131: when the Slot skill rewrite lands, sync the ecosystem-kb vault slot
  page in the same session (standing rule).
- Copied indicator (#129): stale clear-timer must not wipe a newer status.
- Release (#132): tag must equal `packages/tui/package.json` version.

## Related

- [[active-work]]
- [[overview]]
