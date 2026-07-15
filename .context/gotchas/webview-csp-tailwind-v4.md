---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Webview CSP × Tailwind v4

With a Vite **production** build, Tailwind compiles to a static linked stylesheet — no runtime `<style>` injection — so a strict CSP (`script-src 'nonce-…'; style-src ${cspSource}`) is enough. Only add `'unsafe-inline'` to `style-src` if the webview devtools console actually reports a violation. Don't pre-emptively loosen it.

## Related

- [[gotchas]] — index
