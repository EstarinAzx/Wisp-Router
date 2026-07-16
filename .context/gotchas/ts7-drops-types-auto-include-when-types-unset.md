---
type: gotcha
project: wisp
updated: 2026-07-16
tags: [context, gotchas, typescript, toolchain]
---

# TS 7 drops `@types/*` auto-include when `types` is unset

**The trap:** On TypeScript 7 (native), a tsconfig with **no `"types"` field** no longer
auto-includes the `@types/*` packages in `node_modules`. Global ambients silently vanish —
`process`, `Buffer`, `console`, `http`, `crypto`, `setTimeout`, `fetch`, `URL`,
`AbortController`, `TextEncoder`, the `NodeJS` namespace — all `Cannot find name …`. TS 5.4
auto-included them, so a config that typechecked clean for years breaks on the compiler bump with
dozens of errors that look like a missing `@types/node` (it is installed and fine).

**Why:** TS 7's default type-acquisition changed: unset `types` = include nothing ambient, not
include-everything. It bites hardest in this monorepo because `tsc -p ./` in `vscode`/`tui` pulls
`@wisp/core`'s `src` in via imports and typechecks it under the **consumer's** tsconfig — so
core's node-using code loses its globals unless the consumer declares them.

**Rule:** Every tsconfig that typechecks node code (directly or via imported core `src`) must set
`"types": ["node"]` explicitly. `core` already did; `vscode` + `tui` now do. The `types` array
gates only **ambient/global** inclusion — `@types/vscode` and `@types/react` still resolve on
`import`, so `["node"]` is safe and needs no padding. (Separately, TS 7 flags unresolved
side-effect imports like `import './style.css'` with TS2882 — fixed with a `vite/client`
reference in `webview/vscode.d.ts`.)

## Related
- [[gotchas]] — index
- [[two-typescript-configs-must-stay-separate]]
- [[2026-07-16-typescript-7-native-compiler-upgrade]]
