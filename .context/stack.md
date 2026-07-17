---
type: stack
project: wisp
updated: 2026-07-17
tags: [context, stack]
---

# Stack

## Languages & runtime
- TypeScript: `^7.0.2` (native Go compiler, "Project Corsa"; ships `bin/tsc`). devDep in all 3 packages. **Every tsconfig here must set `"types": ["node"]`** — TS 7 dropped auto-inclusion of `@types/*` (see [[gotchas]]).
- Node: dev on v22 (the VS Code extension host runtime)
- VS Code engine: `^1.85.0`

## Frameworks / key libraries
- `openai`: `^4.80.0` â€” the only **runtime** dependency. OpenAI-compatible client pointed at the Zen base URL (`new OpenAI({ apiKey, baseURL })` â†’ `chat.completions.create`, `models.list`). Since #58 it ships **inlined into `dist/extension.js`** by esbuild (vsce runs `--no-dependencies`; nothing from node_modules enters the `.vsix`).
- **Dev-only, bundled into the webview asset at build time:**
  - `preact` `^10.26` + `@preact/preset-vite` `^2.10` â€” side-panel UI (JSX â†’ Preact).
  - `tailwindcss` `^4.1` + `@tailwindcss/vite` `^4.1` â€” styling (CSS-first, `@import "tailwindcss"`, no config file; theme via `--vscode-*` vars).
  - `vite` `^6` â€” bundles `webview/` â†’ single unhashed `dist/webview/main.js` + `main.css`.
- **TUI (`packages/tui` = `wisp-router`, #60):**
  - `@opentui/core` + `@opentui/react` `0.4.3` â€” terminal renderer (native Zig core; per-platform npm binaries incl. `core-win32-x64`) + React reconciler. JSX via `jsxImportSource: @opentui/react`.
  - `react` `^19.2` â€” the TUI's component model (peer of the reconciler).
  - Runs on **Bun** directly (`bun run dev` â†’ `src/index.tsx`, no build step); ships later as `bun build --compile` binaries (ADR-0003, #67).

## Build
Monorepo since #58 (bun workspaces, root `bun.lock`; install with `bun install` at root).

- `bun run compile` (in `packages/vscode`, or via the root script) = `tsc -p ./ && tsc -p webview && bun run bundle && vite build`.
  - `tsc -p ./` â€” **typecheck-only** now (`noEmit`); it follows `@wisp/core` imports into `packages/core` TS source.
  - `tsc -p webview` â€” type-checks only (`noEmit`); Vite's esbuild transform skips type-checking, so this step is what catches webview type errors.
  - `bun run bundle` = `esbuild src/extension.ts --bundle â†’ dist/extension.js` (external `vscode`, cjs, sourcemap) â€” inlines `@wisp/core` + `openai`; this is how the `.vsix` escapes `workspace:*`, which vsce can't resolve (ADR-0001 consequence).
  - `vite build` â†’ `dist/webview/`. Webview is on a **separate tsconfig** (`jsx: react-jsx`, `jsxImportSource: preact`, DOM libs) so the extension compiler never sees browser JSX.
- `@wisp/core` itself has **no build step** â€” `main`/`types` point at `src/index.ts`; consumers bundle raw TS.
- Package: `bun run package` in `packages/vscode` (= `vsce package --no-dependencies`, pinned devDep `@vscode/vsce` `^3.3`; runs `compile` via `vscode:prepublish`). Dev sources excluded by `.vscodeignore`.

## Testing
- `vitest` `^4.1` (devDep of `@wisp/core`) â€” unit-test runner for the **vscode-free** pure logic (`packages/core/tests/*.test.ts`, 367 tests; moved out of `src/` 2026-07-14). Run `bun run test` at root. No `@vscode/test-electron`: the tested functions are pure, so no Extension Development Host is needed. Vitest's default glob finds `tests/` (no config file); core's `tsconfig.json` includes only `src`, so tests stay out of typecheck.
- `bun test` (in `packages/tui`) — first TUI tests, 2026-07-17: `tests/selectScrollDrag.test.ts` drives a real `SelectRenderable` through opentui's real mouse pipeline (`@opentui/core/testing`: test renderer + mock mouse). `tests/` sits OUTSIDE the tui tsconfig include on purpose — `bun:test` types aren't installed, so the `tsc` gate never sees the file. Gate trio for tui changes: `bun run spans` + `bun run compile` + `bun test`.

## Services
- None (no DB/cache). Single external HTTP dependency: the OpenCode Zen provider â€” see [[api]].

## Env vars
- `OPENCODE_API_KEY` â€” fallback API key when none is stored in `~/.wisp/auth.json` (per-provider siblings: `OPENAI_API_KEY`, `GROQ_API_KEY`, â€¦). Key issued at https://opencode.ai/auth.
- `WISP_HOME` â€” overrides the `~/.wisp` store directory (tests/sandboxing; mirrors `CODEX_HOME`). Both faces honor it via `wispHomeDir()`.

## Related
- [[overview]] â€” project shape
- [[api]] â€” how the stack is wired to the provider
