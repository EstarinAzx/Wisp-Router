---
type: stack
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, stack]
---

# Stack

## Languages & runtime
- TypeScript: ~5.4
- Node: dev on v22 (the VS Code extension host runtime)
- VS Code engine: `^1.85.0`

## Frameworks / key libraries
- `openai`: `^4.80.0` — the only runtime dependency. Used as an OpenAI-compatible client pointed at the Zen base URL (`new OpenAI({ apiKey, baseURL })` → `chat.completions.create`, `models.list`).
- **(planned, dev-only — bundled into the webview asset):**
  - `preact` + `@preact/preset-vite` — side-panel UI.
  - `tailwindcss` v4 + `@tailwindcss/vite` — styling (CSS-first, `@import "tailwindcss"`, no config file).
  - `vite` — bundles `webview/` → single unhashed `dist/webview/main.js` + `main.css`.

## Build
- Extension: `tsc -p ./` (config `tsconfig.json`, `include: ["src"]`) → `out/`.
- Webview (planned): `vite build` → `dist/webview/`. Kept on a **separate tsconfig** under `webview/` so the extension compiler never sees browser JSX.

## Services
- None (no DB/cache). Single external HTTP dependency: the OpenCode Zen provider — see [[api]].

## Env vars
- `OPENCODE_API_KEY` — fallback API key when none is stored in SecretStorage. Key issued at https://opencode.ai/auth.

## Related
- [[overview]] — project shape
- [[api]] — how the stack is wired to the provider
