---
type: gotcha
project: wisp
updated: 2026-07-16
tags: [context, gotchas]
---

# opentui: rows garble on small terminals without wrapMode none + flexShrink 0

Two distinct opentui 0.4.3 failure modes, same symptom (rows painted over each other into
garbage), both probe-verified with `testRender` from `@opentui/react/test-utils`:

**1) Narrow terminal — wrap overlay.** A `<text>` row that wraps makes opentui overlay every
row that follows it. Fix: `wrapMode="none"` on every chrome row — clipping always beats
garbage. Only real content (the /test reply + its error text) keeps wrapping.

**2) Short terminal — yoga row-shrink.** When content is taller than the terminal, yoga
shrinks flex children to zero height but opentui **still paints their text** — rows overlay
(the splash bled into the tagline). Fix: `flexShrink={0}` on every chrome row and panel box
(carried by the shared `PANEL` frame in `packages/tui/src/app.tsx`) so overflow clips cleanly
at the bottom edge instead. Tradeoff: bottom rows hide on tiny windows — ScrollBox is the
upgrade path if that ever hurts.

**Headless probe recipe:** `testRender(<jsx/>, { width, height })` → `renderOnce()` →
`captureCharFrame()` prints the char frame — reproduces both bugs in seconds without a real
terminal (fixed in `f5ec8bf` + `645f86d`). When driving the app with `mockInput`, don't trust
`flush()` — React commits lag it; loop with `waitForFrame(predicate)` instead.

**Safe wrap escape hatch (`a07a4ce` + `0180a68`):** long chrome copy that must survive narrow
terminals is wrapped BY HAND — `wrapWords(text, cols)` in `packages/tui/src/app.tsx` splits into
separate `wrapMode="none"` rows sized from `useTerminalDimensions()` (panel text = width − 6).
The native select renderable hard-clips its rows and cannot wrap — the /routing screens use the
hand-rolled `WrapSelect` instead (wrapped descriptions, windowed view, "… N more" markers).
Headless keyboard caveat: the `useKeyboard` subscription is a passive effect that lands a
macrotask AFTER the frame commits — in probes, poll with real `setTimeout` timers between
keypresses; `waitForFrame` alone fires keys before a freshly mounted screen has subscribed.

## Related

- [[gotchas]] — index
- [[opentui-selects-are-invisible-without-an-explicit-height-and-bare]] — sibling opentui traps
