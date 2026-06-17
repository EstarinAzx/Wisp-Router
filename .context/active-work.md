---
type: active-work
project: wisp
updated: 2026-06-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-17 by Opus 4.8 (auto)_
_At commit: uncommitted (slice #6 staged for commit on `feat/inline-chat-pivot`)_

## Current focus
**Slice #6 DONE — Inquire reviews edits via an in-editor inline diff (B2).** Instruction →
the model rewrites the **target span** (selection, or the current line if none) over whole-file
context → the rewrite renders as red-removed / green-added line decorations with **Accept / Reject**
CodeLenses over the change; Accept applies, Reject reverts. Replaces B1's native refactor-preview.
Next: **slice #8 — SEARCH/REPLACE edit blocks** (edit anywhere, safely; supersedes whole-file rewrite).

## State
- **In flight:** nothing.
- **Done this session (slice #6 / B2 inline diff):**
  - `src/catalog.ts`: `diffLines(before, after)` + `DiffOp` type — LCS-backtracked keep/add/remove op
    list, removes-before-adds per hunk, **EOL-agnostic** (splits on `/\r?\n/`; op text is `\r`-free so
    the caller rejoins with the document's own EOL). vscode-free, the testable core.
  - `src/catalog.test.ts`: 6 `diffLines` cases (identical / append / delete / replace / empty-before /
    **CRLF-vs-LF**), TDD red→green. **24/24.**
  - `src/extension.ts`: `renderInlineDiff` (replace span with old+new interleaved, paint
    `diffEditor.insertedTextBackground` / `removedTextBackground` whole-line decorations, removed gets
    `line-through`); CodeLens provider for `✓ Accept` / `✗ Reject` anchored at the **first changed
    line** (so whole-span edits don't strand the lenses off-screen); `resolvePreview(accept)` applies
    kept+added or restores the original; `clearPreview`; preview rejoined with the document EOL. The
    `inquire` tail swapped from the `needsConfirmation` WorkspaceEdit to `renderInlineDiff`. Added
    `err.cause` + ctx logging in the `inquire` catch (diagnostics).
  - Internal commands `wisp.acceptEdit` / `wisp.rejectEdit` (CodeLens-invoked, **not** contributed to
    the palette); two `TextEditorDecorationType`s + the CodeLens provider registered in `activate`.
  - **Reverted** a mid-session experiment that targeted the **whole file** on no-selection — it
    risked the model mangling untouched code (data loss on Accept). Span is back to selection /
    current-line (B2's documented scope). See [[gotchas]] + [[decisions]] edit-fidelity entry.
  - **Verification:** `npm test` **24/24** · `npm run compile` **clean** · F5 eyeball (add-on-line +
    delete-selected-line diffs, Accept/Reject) PASSED earlier this session.
- **Blocked:** nothing.

## Pick up here
**Slice #8 — SEARCH/REPLACE edit blocks (Inquire edit fidelity).** Decision recorded in
[[decisions]] (2026-06-17 edit-fidelity entry); trap in [[gotchas]].
- **Why:** the span/whole-file **re-emit** is the failure mode — asking the model to return the whole
  file to change one line makes it drop/reformat untouched code. Edit blocks make the model emit only
  the **changed regions** (`SEARCH` snippet → `REPLACE`), so untouched code is structurally preserved
  and the user gets caret-agnostic "edit anywhere" safely.
- **TDD the pure core first** (vscode-free, in `src/catalog.ts`): `parseEditBlocks(raw)` → list of
  `{ search, replace }` pairs, and an apply planner (locate each `search` in the document text →
  produce the new text / a not-found result). Then feed the applied result through the **existing**
  `diffLines` + `renderInlineDiff` (B2 reused unchanged) for preview + Accept/Reject.
- New `EDIT_SYSTEM_PROMPT` (or a sibling) that elicits the block format; `extractEditText` may need a
  block-aware variant. Boundaries to test: multiple blocks, search-not-found, empty replace (delete),
  fenced reply, `<think>` wrapper, no-match-safe.
- `npm test` green, `npm run compile` clean, F5.

Then **#7** (bonus: register Wisp as a VS Code LM chat provider) — still **deferred**, resolve the
Option A BYOK/Copilot-plan gating question first (below).

## Skills for next session
- `superpowers:test-driven-development` — `parseEditBlocks` + the apply planner are pure cores; red-green them.
- `superpowers:executing-plans` — pivot slices run in order (#8 next, then deferred #7).

## Open questions
- **Slice #7 (Option A) gating** — BYOK / LM-chat-provider may need Copilot Business/Enterprise (Apr
  2026) vs docs saying no Copilot plan needed. Resolve before #7 (non-blocking for #8).
- **#8 block format** — pick the exact `SEARCH/REPLACE` marker syntax (Aider-style `<<<<<<< SEARCH` /
  `=======` / `>>>>>>> REPLACE`) and decide fuzzy-match policy when the model's `search` text doesn't
  byte-match (whitespace/EOL). Keep matching EOL-agnostic like `diffLines`.

## Recent context
- Inquire's review UX is now **B2** (in-editor decorations + CodeLens). **B1** (native refactor-preview
  via `needsConfirmation`) is gone — the WorkspaceEdit-with-confirmation tail was replaced.
- Inquire **knows** the whole file (whole-file context, unchanged) but **edits** only the target span —
  that span/re-emit limit is exactly what #8 fixes.
- Pure, unit-testable logic lives **vscode-free in `catalog.ts`**; `extension.ts` imports `vscode`.
  `diffLines` lives there; `parseEditBlocks` for #8 belongs there too.
- **Uncommitted, NOT this slice:** `CLAUDE.md` has a pre-existing edit (guideline sections) from before
  this session — keep it out of the slice-#6 commit; commit separately if wanted.

## Related
- [[overview]]
- [[api]] — Inquire is the only surface; review is now in-editor B2
- [[decisions]] — 2026-06-17 edit-fidelity entry (edit blocks chosen over whole-file rewrite)
- [[gotchas]] — don't make the edit span the whole file (mangling / data loss); vscode-free `catalog.ts`
