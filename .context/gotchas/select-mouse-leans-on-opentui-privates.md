---
type: gotcha
project: wisp
updated: 2026-07-17
tags: [context, gotchas, tui, opentui]
---

# SELECT_MOUSE leans on opentui privates — pinned 0.4.3

**The trap:** opentui's `SelectRenderable` is **keyboard-only** — `showScrollIndicator` paints a
thumb glyph but wires no mouse handling. Wisp makes selects mouse-interactive app-side:
`SELECT_MOUSE` (`packages/tui/src/widgets.tsx`), spread into every native `<select>` alongside
`SELECT_COLORS`. It reads three **private** fields (`maxVisibleItems`, `scrollOffset`,
`linesPerItem`) and calls the renderer's **private** `setCapturedRenderable` (capture at
mousedown — otherwise opentui binds drag capture to whatever the first drag event lands on, and a
fast flick off the select kills the gesture).

**Why:** The dep is pinned exact (`0.4.3`), so the privates are stable today. Any
`@opentui/*` bump can rename or remove them and the failure is silent-ish (scrollbar goes dead
again, no compile error — the reads are `as any`).

**Rule:** Two halves, both mandatory:
- Every NEW native `<select>` must spread **`SELECT_MOUSE`** in addition to `SELECT_COLORS`.
- Any `@opentui/*` upgrade must re-run `bun test` in `packages/tui` — `tests/selectScrollDrag.test.ts`
  drives the real mouse pipeline and fails loud if the privates moved. Also re-check that the
  renderer wheel "fallback to focused" is still unreachable (scroll routes to the hit renderable;
  the select only gets wheel events when the pointer is over it).

## Related
- [[gotchas]] — index
- [[opentui-selects-are-invisible-without-an-explicit-height-and-bare]]
