---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Monorepo execution details (#58 / PR #70)

**Decision:** `@wisp/core` has no build step — `main`/`types` point straight at `src/index.ts`
and each face bundles the raw TS source (extension: esbuild → `dist/extension.js`, `tsc`
demoted to typecheck-only). The OAuth *managers* (`codexAuth.ts`, `anthropicAuth.ts`) stayed in
`packages/vscode`, not core — they import `vscode.SecretStorage`; only the pure token cores in
`catalog.ts` moved.
**Why:** a compiled core means a second emit + watch pipeline for zero gain (core is never
published, ADR-0001); esbuild bundling is also what lets vsce package `workspace:*` deps.
ADR-0001's "OAuth clients already vscode-free" was imprecise — clients yes, managers no; #59
(auth.json store, ADR-0002) dissolves the managers' vscode dependency anyway.
**Reversibility:** easy (add a core build later if a consumer ever needs JS artifacts).

## Related

- [[decisions]] — index
