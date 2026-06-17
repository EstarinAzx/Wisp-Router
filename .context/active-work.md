---
type: active-work
project: wisp
updated: 2026-06-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-17 by Opus 4.8 (auto)_
_At commit: uncommitted (slice #5 staged for commit on `feat/inline-chat-pivot`)_

## Current focus
**Slice #5 DONE — Completion removed; Wisp is Inquire-only.** No more always-on ghost-text
autocomplete and no `enabled` toggle. The only feature is **Inquire**: type an instruction → the AI
rewrites the target span (selection, or current line if none) over whole-file context → confirmable
`WorkspaceEdit` replace via VS Code's native refactor-preview. Next: **slice #6 — inline diff (B2)**.

## State
- **In flight:** nothing.
- **Done this session (slice #5 / issue #5):**
  - `src/extension.ts`: ripped the `InlineCompletionItemProvider` + registration, `SYSTEM_PROMPT`,
    `buildContext`/`buildUserPrompt`/`stripPrefixOverlap`/`delay`, the comment-line guard
    (`LINE_COMMENT`/`looksLikeCode`/`reindent`/`relocateAfterComment`), the inert `pendingInquiry`
    stash + provider early-return, the `lastResult` cache, `setEnabled`, the `toggle` command, and
    every `enabled` reference. Status bar collapsed to **thinking/error/ready** (no longer clickable).
    **~260 net lines gone.**
  - `src/catalog.ts` + `catalog.test.ts`: removed `buildInquiryContent` + `INQUIRE_CONTEXT_LIMIT`
    (dead since #4) and their 3 tests. `stripThink`/`stripFences` stay (Inquire's `extractEditText`).
  - `package.json`: dropped `wisp.toggle` command + settings `enabled`/`debounceMs`/`maxPrefixChars`/
    `maxSuffixChars`; reworded `description`.
  - `src/sidePanelProvider.ts` + `webview/app.tsx`: dropped `enabled` from `PanelState`, `setEnabled`
    from `PanelHost` + routing, the toggle checkbox UI, and the **Muted** opacity dressing.
  - `CONTEXT.md`: retired **Completion**/**Suggestion**/**enabled**/**Muted**/**selection-as-prompt**;
    redefined **Inquire** (instruction + target span); status bar 4→3 labels.
  - `.context/overview.md` + `api.md` + `gotchas.md`: reframed to Inquire-only (pruned stale gotchas
    that pointed at the deleted `stripPrefixOverlap`/`delay`/`relocateAfterComment`).
  - **Verification:** `npm test` **18/18** · `npm run compile` **clean** · **F5 eyeball PASSED**
    (panel renders with no toggle, Idle indicator; user screenshot 2026-06-17).
- **Blocked:** nothing.

## Pick up here
**Slice #6 — issue #6 (in-editor inline diff for Inquire, B2).** `gh issue view 6 --comments`.
Today Inquire reviews via VS Code's **native refactor-preview** (B1, `needsConfirmation`); B2 replaces
that with an **in-editor** diff — `setDecorations` (added/removed line backgrounds) + `CodeLens`
(Accept / Reject) over the proposed span.
- **TDD the pure core first:** add `diffLines(before, after)` to `src/catalog.ts` (vscode-free, returns
  a line op list — keep/add/remove) with Vitest cases in `catalog.test.ts` **before** any decoration
  wiring. The decorations + CodeLens are VS Code glue → manual/F5 verify.
- Keep `extension.ts` thin: it reads editor state and renders the diff; the diff math lives in
  `catalog.ts` (see [[gotchas]] — vscode-free logic is the testable layer).
- `npm test` green, `npm run compile` clean, F5.

Then **#7** (bonus: register Wisp as a VS Code LM chat provider) — **deferred**, resolve the Option A
BYOK/Copilot-plan gating question first (below).

## Skills for next session
- `superpowers:test-driven-development` — `diffLines` is a pure core; red-green-refactor it into `catalog.ts`.
- `superpowers:executing-plans` — the slices run in order (#6 next).

## Open questions
- **Slice #7 (Option A) gating** — BYOK / LM-chat-provider may need Copilot Business/Enterprise (Apr
  2026) vs docs saying no Copilot plan needed. Resolve before #7 (non-blocking for #6).

## Recent context
- Inquire's review UX is **B1** (native refactor-preview via `needsConfirmation`); **B2** (in-editor
  decorations + CodeLens) is slice #6 — the next task.
- **Completion is gone, not flag-gated** — the rip is one-way (see [[decisions]] 2026-06-17). The
  status bar no longer has a click action (nothing to toggle).
- Pure, unit-testable logic lives **vscode-free in `catalog.ts`**; `extension.ts` imports `vscode` so
  tests can't import it. `diffLines` for #6 belongs there.
- **Uncommitted, NOT this slice:** `CLAUDE.md` has a pre-existing edit (guideline sections 5–7) from
  before this session — leave it out of the slice-#5 commit; commit separately if wanted.

## Related
- [[overview]]
- [[api]] — Inquire is the only surface now; Completion provider/settings/protocol removed
- [[decisions]] — the pivot + slice-#5 (Completion removed) entries
- [[gotchas]] — vscode-free `catalog.ts` is the testable layer for `diffLines`
