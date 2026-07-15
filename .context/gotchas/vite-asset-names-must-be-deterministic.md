---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Vite asset names must be deterministic

The extension references the webview bundle by fixed path (`main.js` / `main.css`). The Vite config must disable hashing (`entryFileNames`/`assetFileNames` pinned, `cssCodeSplit:false`, `inlineDynamicImports:true`). Default hashed names will 404 in the webview.

## Related

- [[gotchas]] — index
