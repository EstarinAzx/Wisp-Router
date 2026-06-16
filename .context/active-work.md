---
type: active-work
project: wisp
updated: 2026-06-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-16 by Opus 4.8 (auto)_
_On `main` @ `bdcf780` (PR #2 merge). Backlog item 3 shipped; `test/pure-helpers` + `feat/multi-provider-catalog` merged and pruned._

## Current focus
**Pure helpers extracted and unit-tested (backlog item 3 — DONE).** The vscode-coupled resolvers were
pulled into a new vscode-free module and put under test with Vitest — the project's first test runner.
Next session is **user-led**: they want to discuss a **new scope addition** (TBD — they bring it).

## State
- **In flight:** nothing.
- **Done this session:**
  - New `src/catalog.ts` (imports nothing — deliberately vscode-free): `resolveModel`,
    `resolveBaseUrl`, `buildInquiryContent` (reshaped to take `{ text, languageId, offset }`, not a
    `vscode.TextDocument`), and `planLegacyMigration` (a pure plan the applier executes).
  - New `src/catalog.test.ts` — **13 Vitest tests**, all green (limit boundary, windowing bounds,
    migration idempotency, empty-string-model fallback).
  - `src/extension.ts` rewired: thin wrappers delegate to the pure cores, behaviour-identical. Dropped
    now-unused `buildContext` prefix/suffix params (orphaned by the inquiry change).
  - **Verified ollama-cloud** `gpt-oss:120b` works → dropped its ⚠ in `PROVIDERS` (user-confirmed).
  - Tooling: `+vitest` devDep, `test: vitest run` script, `tsconfig.json` excludes `src/**/*.test.ts`
    from the extension build.
  - **Verification:** `npm test` 13/13 green; `npm run compile` clean (extension + webview + vite).
    NOT F5/eyeball-tested (behaviour-identical refactor; user said land it).
- **Blocked:** nothing.

## Pick up here
**Primary (user-led): discuss the new scope addition** the user is bringing — undefined as of this
handoff. Start with `superpowers:brainstorming`; if it firms up, `/preset init` or `to-prd`/`to-issues`.

Remaining backlog (lower priority, carried forward):
1. **Verify the 3 still-⚠ `defaultModel`s** once keys exist — `ollama` (`qwen2.5-coder`), `kilocode` +
   `cline` (`anthropic/claude-3.5-sonnet`). Fix in `PROVIDERS` (`src/extension.ts`). (ollama-cloud now
   verified, dropped from this list.)
2. **README** — document `wisp.provider`, the Provider catalog, reworded `wisp.baseUrl` ("Custom only").

Carried-forward: try a snappier default Zen model (`deepseek-v4-flash` / `kimi-k2.6`).

## Skills for next session
- `superpowers:brainstorming` — for the new scope addition the user brings.
- `superpowers:test-driven-development` — the Vitest harness now exists (`npm test`); TDD any new pure logic into `src/catalog.ts`.

## Open questions
- **The new scope addition is undefined** — the user defines it next session.
- The 3 remaining ⚠ model ids stay unverified until keys exist (non-blocking).

## Recent context
- `test/pure-helpers` (PR #2) and `feat/multi-provider-catalog` (PR #1) both merged to `main` and pruned (local + remote).
- **Pattern established:** pure, unit-testable logic lives vscode-free in `src/catalog.ts`; `extension.ts`
  reads VS Code state and delegates. Tests can't import `extension.ts` (it imports `vscode`). See [[gotchas]].
- **No model-id transform anywhere** — each row's `defaultModel` is the Provider's native form; never
  re-add the `opencode/` prefix (it 401s Zen).

## Related
- [[overview]]
- [[api]]
- [[decisions]]
- [[gotchas]]
