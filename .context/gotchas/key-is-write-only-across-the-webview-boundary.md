---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Key is write-only across the webview boundary

Never post the API key value back to the webview — only a `keyIsSet` boolean. Invalidate the cached OpenAI client whenever the key is set or cleared.

## Related

- [[gotchas]] — index
