---
type: pick-up
project: wisp
updated: 2026-06-17
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-17): slice #6 — Inquire reviews edits via an in-editor inline diff (B2).**
Added `diffLines(before, after)` + `DiffOp` to `src/catalog.ts` (LCS keep/add/remove op list,
EOL-agnostic), TDD'd with 6 cases. Wired `renderInlineDiff` in `src/extension.ts`: red-removed /
green-added line decorations + `✓ Accept` / `✗ Reject` CodeLenses (anchored at the first changed line)
over the span; Accept applies kept+added, Reject restores the original. Replaced B1's
`needsConfirmation` refactor-preview. Internal `wisp.acceptEdit` / `wisp.rejectEdit` commands (not in
the palette). **Reverted** a whole-file-span experiment (mangling / data-loss on Accept) → span is back
to selection / current-line. `npm test` **24/24**, `npm run compile` clean, F5 PASSED. Committed on
`feat/inline-chat-pivot`.

**Next task: slice #8 — SEARCH/REPLACE edit blocks (Inquire edit fidelity).** Decision + rationale in
[[decisions]] (2026-06-17 edit-fidelity entry); trap in [[gotchas]] ("don't make the edit span the whole
file"). Make the model emit only the **changed regions** (`SEARCH` snippet → `REPLACE`) instead of
re-emitting the span/file — that re-emit is what mangles untouched code. **TDD the pure core first** in
`src/catalog.ts`: `parseEditBlocks(raw)` → `{ search, replace }[]` + an apply planner (locate each
`search` in the document → new text / not-found), then feed the applied result through the **existing**
`diffLines` + `renderInlineDiff` (B2 reused as-is). Load `superpowers:test-driven-development`. Then
**#7** (LM-chat-provider bonus) stays deferred — resolve its Option-A BYOK/Copilot-plan gating first
(non-blocking for #8).

**Landmines:**
- **Inquire knows the whole file (context) but edits only the target span.** Don't "fix" that by
  widening the span to the whole file — the whole-file re-emit is the confirmed mangling / data-loss
  vector (see [[gotchas]]). #8's edit blocks are the safe way to edit anywhere.
- **Keep new diff/edit logic vscode-free in `catalog.ts`** — `extension.ts` imports `vscode`, so Vitest
  can't import it. `diffLines` lives in `catalog.ts`; `parseEditBlocks` belongs there too. `extension.ts`
  reads editor state and renders.
- **`diffLines` is EOL-agnostic** (splits `/\r?\n/`); op text is `\r`-free and the caller rejoins with
  the document's EOL. Match this for any `search`-text comparison in #8 (CRLF buffer vs LF model reply).
- **B2 is done — reuse it.** #8 only changes how the new text is *produced* (blocks → applied text);
  the preview/decorations/Accept-Reject path is unchanged.
- **No model-id transform** — each Provider's `defaultModel` is its native form (`opencode/` prefix 401s Zen).
- **Uncommitted, NOT part of slice #6:** `CLAUDE.md` has a pre-existing edit (guideline sections) left
  unstaged — commit separately if wanted.

Full rolling state in [[active-work]]; pivot + edit-fidelity rationale in [[decisions]] (2026-06-17);
domain language in `CONTEXT.md`.
