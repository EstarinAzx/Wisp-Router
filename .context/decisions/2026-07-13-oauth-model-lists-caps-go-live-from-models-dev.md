---
type: decision
project: wisp
updated: 2026-07-13
tags: [context, decisions]
---

# OAuth model lists + caps go live from models.dev

**Decision:** The Codex/Anthropic panel dropdowns and picker caps are models.dev-sourced
(`codexModelsFrom`/`anthropicModelsFrom` + `lookupModelsDevCaps` under the `openai`/`anthropic` keys);
the curated `CODEX_MODELS`/`ANTHROPIC_MODELS` lists and the regex caps tables are demoted to offline
fallback, never removed. Codex filter = keep `gpt-5*`/`o3*`/`o4-mini*`, drop `-pro/-nano/-chat-latest/
-deep-research` suffixes; Anthropic filter = drop dated `-YYYYMMDD` snapshots only — deliberately NO
family whitelist, so a brand-new family name (sonnet-5, fable-5) appears without a code change.
**Why:** Hardcoded lists went stale the day ChatGPT shipped gpt-5.6 Sol/Terra/Luna; models.dev already
carried them (with real caps — 5.6 is ~1M context, the table said 400K) and Wisp already fetches+caches
it. A filter false-positive just errors on pick — chosen over a whitelist that re-creates the staleness.
**Reversibility:** easy (point `modelOptions`/caps back at the constants) — but the fallback contract
means offline behavior IS the old behavior.

## Related

- [[decisions]] — index
