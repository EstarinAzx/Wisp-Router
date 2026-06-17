---
type: pick-up
project: wisp
updated: 2026-06-17
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-17): slice #5 (issue #5) — Completion removed; Wisp is Inquire-only.**
Ripped the `InlineCompletionItemProvider` + registration, `SYSTEM_PROMPT`, the prefix/suffix context
helpers, `stripPrefixOverlap`, `delay`/debounce, the `lastResult` cache, the whole comment-line guard
(`relocateAfterComment` & friends), the inert `pendingInquiry`, and the **`enabled` toggle** across
every layer (`wisp.toggle`, `setEnabled`, status-bar disabled state, panel checkbox + **Muted**). Dropped
Completion-only settings (`enabled`/`debounceMs`/`maxPrefixChars`/`maxSuffixChars`) and the dead
`buildInquiryContent`/`INQUIRE_CONTEXT_LIMIT` + tests. Status bar is now **thinking/error/ready** and
non-clickable. `npm test` **18/18**, `npm run compile` clean, **F5 PASSED**. Committed on
`feat/inline-chat-pivot`.

**Next task: slice #6 — issue #6 (in-editor inline diff for Inquire, B2).** `gh issue view 6 --comments`.
Replace B1's native refactor-preview with an **in-editor** diff: `setDecorations` (added/removed line
backgrounds) + `CodeLens` (Accept/Reject) over the proposed span. **TDD the pure core first** — add
`diffLines(before, after)` to `src/catalog.ts` (vscode-free, returns a keep/add/remove op list) with
Vitest cases **before** wiring decorations. Decorations + CodeLens are VS Code glue → F5 verify. Load
`superpowers:test-driven-development`. Then **#7** (LM-chat-provider bonus) is deferred — resolve its
Option-A BYOK/Copilot-plan gating first (non-blocking for #6).

**Landmines:**
- **Completion is gone, not flag-gated.** Don't look for `pendingInquiry`, `enabled`, the inline
  provider, or the comment-line guard — all deleted. The status bar has no click action now.
- **Keep diff math vscode-free in `catalog.ts`** — `extension.ts` imports `vscode`, so Vitest can't
  import it. `diffLines` (and any new pure logic) lives in `catalog.ts`; `extension.ts` reads editor
  state and renders. (`stripThink`/`stripFences`/`extractEditText`/`buildEditPrompt` already live there.)
- **No model-id transform** — each Provider's `defaultModel` is its native form (`opencode/` prefix 401s Zen).
- **`EditMessage`** must stay a union of two single-role object types (not one object with a
  `'system'|'user'` role) or it stops assigning to the OpenAI SDK message-param array.
- **Uncommitted, NOT part of slice #5:** `CLAUDE.md` has a pre-existing edit (guideline sections 5–7)
  left unstaged — commit separately if wanted.

Full rolling state in [[active-work]]; pivot + slice-#5 rationale in [[decisions]] (2026-06-17);
domain language in `CONTEXT.md` (Inquire-only).
