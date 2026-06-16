---
type: pick-up
project: wisp
updated: 2026-06-16
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-16):** **TDD'd the pure helpers (backlog item 3).** Extracted the
vscode-coupled resolvers into a new **vscode-free `src/catalog.ts`** (`resolveModel`, `resolveBaseUrl`,
`buildInquiryContent`, `planLegacyMigration`) and put them under **13 Vitest tests** (`src/catalog.test.ts`)
— the project's first test runner. `extension.ts` wrappers now delegate, behaviour-identical. Also
**verified ollama-cloud** (`gpt-oss:120b`) and dropped its ⚠. `npm test` 13/13 green, `npm run compile`
clean. **Merged to `main`** via PR #2 (merge commit `bdcf780`); branch pruned. You're on `main`, clean.

**Next task: USER-LED — discuss a new scope addition.** The user said they'll bring a **new addition to
the scope** next session; it is undefined here. Start with `superpowers:brainstorming` to shape it; if it
firms up into work, `/preset init` or `to-prd`/`to-issues`. Don't assume what it is — let the user define it.

Carried-forward backlog (only if the user wants it instead):
- Verify the **3 still-⚠** `defaultModel`s once keys exist — `ollama` (`qwen2.5-coder`), `kilocode` +
  `cline` (`anthropic/claude-3.5-sonnet`). Fix in `PROVIDERS` (`src/extension.ts`).
- **README** — document `wisp.provider`, the catalog, reworded `wisp.baseUrl` ("Custom only").

**Landmines (see [[gotchas]] + [[active-work]]):**
- **Keep pure logic in `catalog.ts` (vscode-free).** `extension.ts` imports `vscode`, so tests can't
  import it — new testable logic goes in `catalog.ts` and is TDD'd via `npm test`. Don't fold it back inline.
- **No model-id transform** — each row's `defaultModel` is the Provider's native form; never re-add the
  `opencode/` prefix (it 401s Zen).
- Built-in base URLs are hardcoded in `PROVIDERS` (code), never settings; `wisp.provider` + `wisp.baseUrl`
  are `"scope": "machine"` — the key-redirect defense. Don't relax.
- `wisp.model` is a **mirror**; source of truth is `globalState['wisp.models']` per-Provider map.
- `catalog.ts` is on `main` now; `test/pure-helpers` (PR #2) + `feat/multi-provider-catalog` (PR #1) both merged and pruned (local + remote).

Full rolling state in [[active-work]]; settled choices in [[decisions]]; domain language in `CONTEXT.md`.
