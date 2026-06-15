---
type: stack
project: wisp
updated: 2026-06-15
tags: [context, stack]
---

# Stack

## Languages & runtime
- TypeScript: ~5.4
- Node: dev on v22 (the VS Code extension host runtime)
- VS Code engine: `^1.85.0`

## Frameworks / key libraries
- `openai`: `^4.80.0` — the only **runtime** dependency. OpenAI-compatible client pointed at the Zen base URL (`new OpenAI({ apiKey, baseURL })` → `chat.completions.create`, `models.list`). Ships inside the `.vsix` (vsce packages prod deps; no bundling needed).
- **Dev-only, bundled into the webview asset at build time:**
  - `preact` `^10.26` + `@preact/preset-vite` `^2.10` — side-panel UI (JSX → Preact).
  - `tailwindcss` `^4.1` + `@tailwindcss/vite` `^4.1` — styling (CSS-first, `@import "tailwindcss"`, no config file; theme via `--vscode-*` vars).
  - `vite` `^6` — bundles `webview/` → single unhashed `dist/webview/main.js` + `main.css`.

## Build
- `npm run compile` = `tsc -p ./ && tsc -p webview && vite build`.
  - `tsc -p ./` (config `tsconfig.json`, `include: ["src"]`) → `out/` — the extension.
  - `tsc -p webview` — **type-checks only** (`noEmit`); Vite's esbuild transform skips type-checking, so this step is what catches webview type errors.
  - `vite build` → `dist/webview/`. Webview is on a **separate tsconfig** (`jsx: react-jsx`, `jsxImportSource: preact`, DOM libs) so the extension compiler never sees browser JSX.
- Package: `npx @vscode/vsce package --allow-missing-repository --skip-license` → `.vsix` (runs `compile` via `vscode:prepublish`). Dev sources excluded by `.vscodeignore`.

## Services
- None (no DB/cache). Single external HTTP dependency: the OpenCode Zen provider — see [[api]].

## Env vars
- `OPENCODE_API_KEY` — fallback API key when none is stored in SecretStorage. Key issued at https://opencode.ai/auth.

## Related
- [[overview]] — project shape
- [[api]] — how the stack is wired to the provider
