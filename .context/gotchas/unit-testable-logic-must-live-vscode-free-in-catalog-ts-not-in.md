---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Unit-testable logic must live vscode-free in `catalog.ts`, not in `extension.ts`

`extension.ts` imports `vscode` (and `openai`) at the top, so a plain Vitest/Node test can't import it —
there's no Extension Development Host outside VS Code, so the import throws. Pure, unit-testable logic
therefore lives in `src/catalog.ts`, which **imports nothing**: `resolveModel`, `resolveBaseUrl`,
`planLegacyMigration` (the migration's decision as a pure plan; `extension.ts` applies it), and the
Inquire helpers `buildEditPrompt` / `extractEditText` (`stripThink` + `stripFences`). The
`extension.ts` wrappers read VS Code state and delegate. Don't fold this logic back inline "to keep it
together" — it becomes untestable. Tests live in `packages/core/tests/` (outside core's `tsconfig`
`include: ["src"]`, so they skip typecheck). Run `bun run test`. See [[decisions]].

## Related

- [[gotchas]] — index
