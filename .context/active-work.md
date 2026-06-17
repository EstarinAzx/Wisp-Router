---
type: active-work
project: wisp
updated: 2026-06-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-17 by Opus 4.8 (auto)_
_At commit: uncommitted (slice #8 staged for commit on `feat/inline-chat-pivot`)_

## Current focus
**Slice #8 DONE — Inquire edits via SEARCH/REPLACE edit blocks.** The model gets the whole file +
the instruction and returns Aider-style edit blocks (`<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE`)
instead of re-emitting a span/whole file. Wisp locates each SEARCH verbatim, splices in the REPLACE,
and renders the before/after through the **existing B2 inline diff** (red/green decorations +
Accept/Reject CodeLenses). This delivers caret-agnostic "edit anywhere" without the whole-file re-emit
that mangled untouched code. Next: **slice #7** (deferred bonus — register Wisp as a VS Code LM chat
provider), still gated on the BYOK/Copilot-plan question.

## State
- **In flight:** nothing.
- **Done this session (slice #8 / edit blocks):**
  - `src/catalog.ts`: `parseEditBlocks(raw)` → `{ search, replace }[]` (Aider markers via one regex;
    strips `<think>` first, normalizes CRLF→LF, ignores surrounding prose/```` ``` ```` fences; empty
    REPLACE = deletion). `applyEditBlocks(documentText, blocks)` → `{ text, notFound }` — EOL-agnostic
    first-occurrence locate+splice, applies each block against the running result, records misses
    (empty search guarded → never injects at position 0). Output is LF; the caller rejoins with the
    document EOL (same contract as `diffLines`). New `EditBlock` / `EditPlan` types.
  - New block-eliciting `EDIT_SYSTEM_PROMPT`; `buildEditPrompt` **dropped `selectionText`** (the model
    edits anywhere via blocks, no target span).
  - **Removed** `extractEditText` + `stripFences` (orphaned — `parseEditBlocks` superseded them);
    `stripThink` kept and reused by `parseEditBlocks`.
  - `src/catalog.test.ts`: +`parseEditBlocks` (9) +`applyEditBlocks` (8) suites, reworked
    `buildEditPrompt` tests for the new signature, dropped `extractEditText` tests. **35/35.**
  - `src/extension.ts` `inquire`: `parseEditBlocks(reply)` → `applyEditBlocks(original)` → whole-doc
    span through the **unchanged** `renderInlineDiff`. Guards: 0 blocks → "nothing to change";
    all-not-found → "could not locate the text to edit"; no-op (applied == original) → "no change";
    partial miss → warn "N of M edits could not be located". The whole-doc diff span is **safe** here
    (the applied result preserves untouched code verbatim — NOT the re-emit the gotcha warns about).
  - **Debug instrumentation** (raw-reply + miss/trimmedMatch logging) was added to diagnose the F5
    misses, then **removed** before commit.
  - **Verification:** `npm test` **35/35** · `npm run compile` **clean** · F5 eyeball PASSED (block
    edit applies, minimal diff renders, Accept/Reject work).
- **Blocked:** nothing.

## Pick up here
**Slice #7 — register Wisp as a VS Code Language Model Chat Provider (deferred bonus, HITL).**
- **Resolve first (open question):** the Option-A BYOK gating — may need GitHub Copilot
  Business/Enterprise (as of Apr 2026) vs docs saying no Copilot plan needed. This is the blocker;
  settle it before building. See [[decisions]] 2026-06-17 pivot entry.
- Inference stays on Wisp's own OpenAI-compatible client (provider-agnostic) — #7 only adds a *surface*
  (Wisp models appearing in native inline chat), never replaces the client.
- It's the LAST planned slice of the pivot; everything core (Inquire inline-chat editor + edit blocks)
  is shipped.

## Skills for next session
- `superpowers:test-driven-development` — keep any new pure core (e.g. a chat-provider adapter) red-green.
- `superpowers:systematic-debugging` — the edit-block F5 misses were chased this way; reuse it for #7's
  provider-registration quirks.

## Open questions
- **Slice #7 (Option A) gating** — BYOK / LM-chat-provider Copilot-plan requirement (above). Unresolved.
- **Edit-block match fidelity (deferred fork)** — matching is **exact** (EOL-agnostic only), chosen over
  whitespace-fuzzy. F5 showed reasoning models *sometimes* return non-verbatim SEARCH (→ "could not
  locate") or no blocks (→ "nothing to change"); a retry produced a matching block. It fails **safe**
  (no data loss, misses surfaced). Revisit fuzzy/trimmed-line matching only if real use shows the misses
  are frequent enough to annoy. See [[gotchas]].

## Recent context
- Inquire is now a full inline-chat **editor**: instruction → edit blocks → in-editor B2 diff with
  Accept/Reject. Completion is gone (slice #5); the span/whole-file rewrite path is gone (slice #8).
- Pure, unit-testable logic stays **vscode-free in `catalog.ts`** (`parseEditBlocks`/`applyEditBlocks`
  joined `diffLines`/`buildEditPrompt`/resolvers there); `extension.ts` reads editor state and renders.
- **Uncommitted, NOT this slice:** `CLAUDE.md` has a pre-existing edit (guideline sections) from before
  this session — kept out of the slice-#8 commit; commit separately if wanted.

## Related
- [[overview]]
- [[api]] — Inquire is the only surface; edits are SEARCH/REPLACE blocks reviewed via the B2 diff
- [[decisions]] — 2026-06-17 edit-fidelity entry (edit blocks) + the slice-#8 build entry
- [[gotchas]] — edit-blocks are flaky with reasoning models (fails safe); don't whole-file re-emit;
  vscode-free `catalog.ts`
