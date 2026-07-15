---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# TUI MVP execution details (#60 / PR #72)

**Decision:** the `PROVIDERS` data array moved verbatim from `extension.ts` into core
`catalog.ts` — one catalog rendered by both faces; per-face provider lists are a closed path.
`packages/tui` is npm **`wisp-router` 0.1.0** with bin `wisp` only — the `claude-wisp` bin is
NOT declared until its launcher exists (#64): a bin pointing at a missing file breaks install
linking. TUI key entry is hand-rolled (useKeyboard + usePaste rendering bullets) because
opentui's input has no masked mode; an inline `/key <id> <key>` is refused (already echoed) and
the masked field opened instead. Exit paths always `renderer.destroy()` before `process.exit`
— bare exit skips opentui teardown and strands the terminal in raw mode. opentui `<select>`
renders zero rows without an explicit `height` (2 rows per option while descriptions show).
**Why:** #60 execution facts that cost real time or close re-proposable paths; the select and
exit behaviors are opentui 0.4.3 ground truth verified by render probes, not docs.
**Reversibility:** all easy except the npm name (public once #67 publishes) and the
inline-key refusal (security posture — one-way).

## Related

- [[decisions]] — index
