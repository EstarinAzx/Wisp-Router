---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# Drop the context guess table; keep the vision fallback (resolves the open question)

**Decision:** Remove `CONTEXT_TABLE` / `contextForModel` (the family-keyed context-window guesses).
Context now resolves **models.dev caps → neutral `DEFAULT_MAX_*`** only. **Keep** `VISION_FAMILIES` /
`modelSupportsVision` as the vision fallback.
**Why:** with models.dev as the live source, the context table only fired offline / for the unmapped
providers (local Ollama, Cline, Custom) / unlisted models — and there a guess can be wrong, so "unknown
→ neutral default" is more honest. Vision is kept because it's the **only** capability with no other
fallback signal, and the failure modes differ: a wrong context window is just a wrong budget, whereas a
guessed vision flag would send images a backend rejects. `npm test` 67/67.
**Reversibility:** easy (the table was pure data) — but don't re-add a context guess; models.dev or
neutral default is the intended behaviour.

## Related

- [[decisions]] — index
