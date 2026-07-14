---
type: stack
project: wisp
updated: 2026-07-14
tags: [context, stack]
---

# Stack

## Languages & runtime
- TypeScript: ~5.4
- Node: dev on v22 (the VS Code extension host runtime)
- VS Code engine: `^1.85.0`

## Frameworks / key libraries
- `openai`: `^4.80.0` — the only **runtime** dependency. OpenAI-compatible client pointed at the Zen base URL (`new OpenAI({ apiKey, baseURL })` → `chat.completions.create`, `models.list`). Since #58 it ships **inlined into `dist/extension.js`** by esbuild (vsce runs `--no-dependencies`; nothing from node_modules enters the `.vsix`).
- **Dev-only, bundled into the webview asset at build time:**
  - `preact` `^10.26` + `@preact/preset-vite` `^2.10` — side-panel UI (JSX → Preact).
  - `tailwindcss` `^4.1` + `@tailwindcss/vite` `^4.1` — styling (CSS-first, `@import "tailwindcss"`, no config file; theme via `--vscode-*` vars).
  - `vite` `^6` — bundles `webview/` → single unhashed `dist/webview/main.js` + `main.css`.

## Build
Monorepo since #58 (bun workspaces, root `bun.lock`; install with `bun install` at root).

- `bun run compile` (in `packages/vscode`, or via the root script) = `tsc -p ./ && tsc -p webview && bun run bundle && vite build`.
  - `tsc -p ./` — **typecheck-only** now (`noEmit`); it follows `@wisp/core` imports into `packages/core` TS source.
  - `tsc -p webview` — type-checks only (`noEmit`); Vite's esbuild transform skips type-checking, so this step is what catches webview type errors.
  - `bun run bundle` = `esbuild src/extension.ts --bundle → dist/extension.js` (external `vscode`, cjs, sourcemap) — inlines `@wisp/core` + `openai`; this is how the `.vsix` escapes `workspace:*`, which vsce can't resolve (ADR-0001 consequence).
  - `vite build` → `dist/webview/`. Webview is on a **separate tsconfig** (`jsx: react-jsx`, `jsxImportSource: preact`, DOM libs) so the extension compiler never sees browser JSX.
- `@wisp/core` itself has **no build step** — `main`/`types` point at `src/index.ts`; consumers bundle raw TS.
- Package: `bun run package` in `packages/vscode` (= `vsce package --no-dependencies`, pinned devDep `@vscode/vsce` `^3.3`; runs `compile` via `vscode:prepublish`). Dev sources excluded by `.vscodeignore`.

## Testing
- `vitest` `^4.1` (devDep of `@wisp/core`) — unit-test runner for the **vscode-free** pure logic (`packages/core/src/*.test.ts`, 304 tests). Run `bun run test` at root. No `@vscode/test-electron`: the tested functions are pure, so no Extension Development Host is needed. Core's `tsconfig.json` excludes `src/**/*.test.ts` from typecheck (mirrors the old build exclusion).

## Services
- None (no DB/cache). Single external HTTP dependency: the OpenCode Zen provider — see [[api]].

## Env vars
- `OPENCODE_API_KEY` — fallback API key when none is stored in SecretStorage. Key issued at https://opencode.ai/auth.

## Related
- [[overview]] — project shape
- [[api]] — how the stack is wired to the provider
