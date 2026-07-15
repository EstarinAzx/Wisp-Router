---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# Read real context/vision LIVE from models.dev (the big one)

**Decision:** Stop hardcoding context windows / vision. Read them live from **[models.dev](https://models.dev)**
`api.json` — a public, no-auth aggregated catalog (~145 providers) carrying each model's real
`limit.context`, `limit.output`, and `modalities.input` (contains `"image"` ⇒ vision). Each Provider row
gains a **`catalogKey`** (matched to models.dev by **base-URL**, not name — e.g. `.../zen/go/v1` →
**`opencode-go`**, NOT `opencode`; `kilocode` → `kilo`). New `src/modelsDev.ts` fetches + caches (30-min
TTL, in-flight dedupe, warmed at registration, 4-s timeout so a cold fetch never stalls the picker).
Pure `parseModelsDevEntry`/`lookupModelsDevCaps` in `catalog.ts`. Resolution chain per field:
**models.dev → hardcoded heuristic table (`CONTEXT_TABLE`/`VISION_FAMILIES`) → neutral default**.
**Why models.dev over per-provider /models:** ~half the providers publish **nothing** via their own API
(OpenAI, OpenCode Zen — verified against OpenAI's OpenAPI spec/SDK); others need special endpoints
(Ollama `POST /api/show` per model, Cline's authed path). models.dev is the one source covering all of
them + vision, in a single cached fetch. Discovered + adversarially verified by a 19-agent research
workflow (686k tokens) — the provider-key map and field names are verified against the live `api.json`
and its source Zod schema. **Local Ollama, Cline, Custom are absent from models.dev → table/default.**
**Reversibility:** easy — caps are injected and degrade to the old table behaviour on any failure. The
table is now a *fallback*, kept deliberately (offline / models models.dev doesn't list).

## Related

- [[decisions]] — index
