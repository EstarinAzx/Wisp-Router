---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# No fill-in-middle (FIM) on the Zen endpoint

The provider exposes **only** OpenAI-compatible chat completions — there is no FIM/`suffix` route. Inquire prompts a *chat* model to rewrite a span (whole-file context → return only the replacement code). Don't go looking for a FIM endpoint to "do it properly"; it doesn't exist. This is also why latency is ~0.5–1.5s, not sub-100ms.

## Related

- [[gotchas]] — index
