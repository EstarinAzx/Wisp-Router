---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# `setEffort` (and any globalState write) fires no config event — re-push the panel yourself

`setModel` mirrors into `wisp.model`, and the `onDidChangeConfiguration` listener re-`postState()`s the
panel. A **globalState** write (`wisp.models`, `wisp.effort`) triggers **no** event, so a mutation that only
touches globalState must call `panel.postState()` itself or the controlled input won't reflect the change.
`setEffort` does exactly this. Don't remove that line, and remember it for any future globalState-backed knob.

## Related

- [[gotchas]] — index
