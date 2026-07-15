---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex reasoning models REQUIRE a `reasoning` object — and `gpt-5-codex` is a dead id

The Codex `/responses` backend **400s** a gpt-5/o-series request that omits `reasoning: { effort, summary:'auto' }`,
and **400s** a gpt-4.x/spark request that *includes* it — so it's per-model (`codexReasoning` in `catalog.ts`:
`medium` for gpt-5/o, undefined for gpt-4.x/`*-spark`). Separately, **`gpt-5-codex` is not a valid model id**
(400); the live lineup is `gpt-5.5`/`gpt-5.4`/`gpt-5.3-codex`/`gpt-5.3-codex-spark`/`gpt-5.2-codex`/
`gpt-5.1-codex-max`/`gpt-5.1-codex-mini`/`gpt-5.4-mini`/`o3`/`o4-mini` (the codex row default is `gpt-5.3-codex`).
There is **no `/models` route** on the Codex backend, so the dropdown uses the hardcoded `CODEX_MODELS` list,
not a live fetch. Both confirmed by the #13 F5 round-trip. See [[decisions]] 2026-06-19.

## Related

- [[gotchas]] — index
