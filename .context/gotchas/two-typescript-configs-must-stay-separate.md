---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Two TypeScript configs must stay separate

The extension `tsconfig.json` keeps `include: ["src"]`. The webview's JSX lives under `webview/` with its **own** tsconfig (`jsx: react-jsx`, `jsxImportSource: preact`). If the extension `tsc` ever picks up the webview files it will fail on browser JSX/DOM types. `compile` runs both (`tsc -p ./ && tsc -p webview && vite build`) — Vite's esbuild transform does **not** type-check, so without the `tsc -p webview` step webview type errors ship silently.

## Related

- [[gotchas]] — index
