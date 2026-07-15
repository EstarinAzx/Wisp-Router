---
type: decision
project: wisp
updated: 2026-06-16
tags: [context, decisions]
---

# Extract pure cores to a vscode-free module + Vitest for unit tests

**Decision:** Pull the pure logic out of the VS Code-coupled wrappers into a new **`src/catalog.ts`
that imports nothing** — `resolveModel`, `resolveBaseUrl`, `buildInquiryContent` (reshaped to take
`{ text, languageId, offset }` instead of a `vscode.TextDocument`), and `planLegacyMigration` (the
migration's idempotency/correctness **decision** as a pure plan; `extension.ts` reads storage state,
calls it, applies the plan). `extension.ts` keeps thin wrappers that read config/state and delegate —
behaviour-identical. Add **Vitest** as the test runner (`test: vitest run`, `tsconfig` excludes
`src/**/*.test.ts` from the extension build); 13 tests cover the four functions. `ollama-cloud`'s
`gpt-oss:120b` was **user-verified working** (its ⚠ dropped).
**Why:** the resolvers read module-level VS Code state and `extension.ts` imports `vscode` at the top,
so nothing there is importable by a plain Node/Vitest test (no Extension Development Host). Extracting
the pure cores makes them genuinely unit-testable **without** `@vscode/test-electron` — Vitest was
chosen over the official VS Code test harness precisely because the logic under test is pure, so an
Electron host is dead weight. Establishes the pattern: testable logic is vscode-free in `catalog.ts`.
**Reversibility:** easy — but don't fold the pure logic back inline; that re-breaks testability (see [[gotchas]]).

## Related

- [[decisions]] — index
