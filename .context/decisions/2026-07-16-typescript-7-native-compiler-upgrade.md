---
type: decision
project: wisp
updated: 2026-07-16
tags: [context, decisions, typescript, toolchain]
---

# Upgrade to TypeScript 7.0.2 (native Go compiler)

**Decision:** Bumped the `typescript` devDep from `^5.4` (tui was `^5.9.3`) to `^7.0.2` — the
native Go compiler ("Project Corsa"), which is npm `latest` — across `core`, `vscode`, `tui`.
It ships `bin/tsc`, so the existing `tsc -p …` typecheck scripts run unchanged. Two TS-7
behavior changes were absorbed **config-only** (no product-code change): every tsconfig that
typechecks core's `src` must set `"types": ["node"]` (TS 7 no longer auto-includes `@types/*`),
and side-effect CSS imports need a `vite/client` reference (TS2882).

**Why:** The native compiler is the shipped `latest` and much faster; staying on 5.4 left the
toolchain six minors behind. The `types:["node"]` requirement is now a **standing constraint on
any new tsconfig** in this repo — see [[ts7-drops-types-auto-include-when-types-unset]].

**Reversibility:** easy — devDep only; nothing ships TypeScript (Bun transpiles the TUI at
runtime, vsce bundles the extension via esbuild). Revert = restore the version strings + drop the
two config lines. Gate proof: 434 tests, full vscode `.vsix` build, tui `tsc`, all green; `bun
run dev` launched.

## Related
- [[decisions]] — index
- [[ts7-drops-types-auto-include-when-types-unset]]
- [[stack]]
