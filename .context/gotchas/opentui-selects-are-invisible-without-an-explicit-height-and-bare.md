---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# opentui: selects are invisible without an explicit height, and bare exit strands the terminal

Three opentui 0.4.3 traps (probe-verified, not in docs). **1)** `<select>` renders **zero rows**
unless given an explicit `height` — the wrapping box auto-sizes around an empty list and the
picker looks broken (an option is **2 rows** while `showDescription` is on). **2)** a bare
`process.exit()` skips opentui's teardown (no `beforeExit` on explicit exit) and leaves the
terminal in raw mode / the alternate screen — every TUI exit path must `renderer.destroy()`
first (`exitTui()` in `packages/tui/src/app.tsx`). **3)** **border titles silently drop
non-ASCII** — a `title` containing an em-dash/`·` renders as no title at all (the #62 /test
screenshot), while the same characters render fine in body `<text>`. Keep border titles
plain ASCII (screenshot-confirmed on the #63 /bridge screen; /test's title fixed in `f2efe18`).

## Related

- [[gotchas]] — index
