---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 14:12 by Opus 4.8 (auto)._
_At commit: `b4afc6e` on `main` (local — NOT pushed). TypeScript 5.4 → 7.0.2._

## Current focus
**Nothing in flight.** This session upgraded the toolchain to TypeScript 7.0.2 (native Go
compiler) across all 3 packages and landed it on `main`. Ready queue empty; next work from the
carried backlog below.

## State
- **TypeScript 5.4 → 7.0.2 (native compiler) landed** (`b4afc6e`, local). `typescript` devDep
  bumped to `^7.0.2` in core, vscode, tui (all now on the native `tsc`). Two TS-7 behavior
  changes surfaced, both **config-only** (zero product-code changed):
  - TS 7 no longer auto-includes `@types/*` when `types` is unset → node/DOM globals vanished
    from the vscode + tui typechecks (they compile core's `src` via imports). Fix: `"types":
    ["node"]` added to `packages/vscode/tsconfig.json` + `packages/tui/tsconfig.json` (core
    already declared it). See [[ts7-drops-types-auto-include-when-types-unset]].
  - TS 7 enforces TS2882 on unresolved side-effect imports → webview's `import './style.css'`
    broke. Fix: `/// <reference types="vite/client" />` in `packages/vscode/webview/vscode.d.ts`.
- **Gate GREEN:** `bun run compile` (tsc×2 + esbuild + vite build), tui `tsc -p ./`,
  `bun run test` (434 tests). Plus `bun run dev` launched clean (runtime uses Bun's transpiler;
  TS is dev-only so runtime was never at risk).
- **Not pushed** — `main` is 1 commit ahead of `origin/main`.

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty. First, decide whether to **push** `b4afc6e` to origin (nothing forces it —
TS is dev-only, no release/tag). Then pick from the carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
   **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. **catalog.ts modularization** (DEFERRED, owner will init) — 4-file peel first, shared-kernel
   rule, green-to-green. Full plan: [[2026-07-15-catalog-ts-modularization-plan-deferred]].
3. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Skills for next session
(none clearly apply — backlog items are human-step / deferred)

## Open questions
- (carried) grok-4.5 rides the public `api.x.ai` lane — whether xAI bills it under SuperGrok or
  as metered API usage is unverified (untestable from here).
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- TS 7.0.2 is `latest` on npm (real/stable, not a preview); it ships `bin/tsc`, so the build
  scripts (`tsc -p ./`, `tsc -p webview`) keep working unchanged.
- The `types:[…]` array gates only **global/ambient** auto-inclusion — `@types/vscode` +
  `@types/react` still resolve via `import`, so restricting to `["node"]` is safe.
- `.context/overview.md` carries a phantom `M` (LF→CRLF normalization only, no content change).

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
