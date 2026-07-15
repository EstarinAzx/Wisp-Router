---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex caps come from `codexModelCaps`, not models.dev — and it IS vision-capable

The Codex row has no models.dev `catalogKey` and the backend has no `/models` route, so the live-caps path
(which retired the context guess table) can't reach these ids. `codexModelCaps` (in `catalog.ts`) supplies
real windows — gpt-5.x **400K/32K**, o-series **200K/100K** — and `vision: true`. `chatProvider`'s caps
resolver routes codex rows to it. **Vision is real**: gpt-5/o are multimodal and the Codex backend accepts
`input_image` (XETH-7's codexShim forwards it to the same endpoint) — don't be misled by Copilot's
conservative `modalities: ['text']` registry flag, which understates it. This is the one place a small
codex-only caps table is intentional (see [[decisions]] 2026-06-19); don't fold codex back to the neutral
default.

## Related

- [[gotchas]] — index
