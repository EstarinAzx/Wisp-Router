---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Server error bodies can leak the key — sanitize before posting to the webview

`fetchModelIds` failures must not forward raw `String(err)` to the panel: OpenAI-style 401 bodies echo key fragments (`Incorrect API key provided: sk-…`). `sanitizeError` in `src/sidePanelProvider.ts` maps to a status-code string. The write-only-key rule covers error text too.

## Related

- [[gotchas]] — index
