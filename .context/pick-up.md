---
type: pick-up
project: wisp
updated: 2026-06-17
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-17): slice #8 — Inquire edits via SEARCH/REPLACE edit blocks.**
Added `parseEditBlocks(raw)` → `{ search, replace }[]` and `applyEditBlocks(doc, blocks)` →
`{ text, notFound }` to `src/catalog.ts` (Aider markers `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE`;
strips `<think>`, CRLF→LF, ignores fences/prose, empty REPLACE = delete; EOL-agnostic first-occurrence
locate+splice, empty-search guarded), TDD'd — **35/35**. New block-eliciting `EDIT_SYSTEM_PROMPT`;
`buildEditPrompt` dropped `selectionText`. **Removed** orphaned `extractEditText` + `stripFences`
(`stripThink` kept, reused by the parser). `extension.ts` `inquire` now parses → applies → diffs the
**whole document** before/after through the **unchanged** B2 `renderInlineDiff` (Accept/Reject lenses).
Guards: 0 blocks → "nothing to change"; all-miss → "could not locate"; no-op → "no change"; partial miss
→ warn N/M. `npm test` **35/35**, `npm run compile` clean, **F5 PASSED**. Debug instrumentation added to
diagnose F5 misses, then **removed** before commit. Committed on `feat/inline-chat-pivot`.

**Next task: slice #7 — register Wisp as a VS Code Language Model Chat Provider (deferred bonus, HITL).**
**Resolve the gate FIRST:** Option-A BYOK gating may need GitHub Copilot Business/Enterprise (Apr 2026)
vs docs saying no Copilot plan needed — settle this before building (see [[decisions]] 2026-06-17 pivot
entry). #7 only adds a *surface* (Wisp models in native inline chat); inference stays on Wisp's own
OpenAI-compatible client. It's the LAST planned pivot slice — core is shipped.

**Landmines:**
- **Edit blocks are flaky with reasoning models, but fail SAFE.** A run may miss (non-verbatim SEARCH →
  "could not locate") or return no blocks ("nothing to change"); retry usually works. Match is **exact**
  (EOL-agnostic only) on purpose — a miss is skipped, never force-matched, so no data loss. Don't
  reflexively add fuzzy/trimmed matching (wrong-region risk); the fuzzy fork is deferred to "only if real
  use shows frequent misses." See [[gotchas]].
- **Don't reintroduce whole-file re-emit** as the edit path — confirmed mangling/data-loss vector. The
  whole-doc diff *span* in `inquire` is fine (it diffs the *applied* result, which preserves untouched
  code verbatim) — that is NOT a re-emit.
- **Keep new pure logic vscode-free in `catalog.ts`** — `extension.ts` imports `vscode`, so Vitest can't
  import it. `parseEditBlocks`/`applyEditBlocks` live in `catalog.ts`; `extension.ts` reads editor state
  and renders.
- **EOL-agnostic everywhere** — `applyEditBlocks` output is LF; the caller rejoins with the document EOL
  (same contract as `diffLines`). Match this for any new text comparison.
- **No model-id transform** — each Provider's `defaultModel` is its native form (`opencode/` prefix 401s Zen).
- **Uncommitted, NOT part of slice #8:** `CLAUDE.md` has a pre-existing edit (guideline sections) left
  unstaged — commit separately if wanted.

Full rolling state in [[active-work]]; edit-blocks rationale in [[decisions]] (2026-06-17); domain
language in `CONTEXT.md`.
