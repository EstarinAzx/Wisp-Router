---
type: decision
project: wisp
updated: 2026-06-17
tags: [context, decisions]
---

# Completion removed (slice #5 lands the pivot's one-way step)

**Decision:** Ripped **Completion** end-to-end — Wisp is now **Inquire-only**. Gone: the
`InlineCompletionItemProvider` + registration, `SYSTEM_PROMPT`, the prefix/suffix context
(`buildContext`/`buildUserPrompt`), `stripPrefixOverlap`, the `delay`/debounce, the single-entry
`lastResult` cache, the whole comment-line guard (`LINE_COMMENT`/`looksLikeCode`/`reindent`/
`relocateAfterComment`), the now-inert `pendingInquiry` stash + provider early-return, the **`enabled`
toggle** across every layer (`wisp.toggle` command, `setEnabled`, the status-bar disabled state, the
panel checkbox + its **Muted** dressing), and the Completion-only settings (`enabled`/`debounceMs`/
`maxPrefixChars`/`maxSuffixChars`). `catalog.ts` lost `buildInquiryContent` + `INQUIRE_CONTEXT_LIMIT`
(dead since #4) and their tests. `CONTEXT.md` retired Completion/Suggestion/enabled/Muted/
selection-as-prompt. The status bar collapsed to **thinking / error / ready** and is no longer
clickable (no toggle to bind). Verified: `npm test` 18/18, `npm run compile` clean, F5 eyeball PASSED.
**Why:** Inquire got its own edit surface in #4, so Completion was the last thing pinning the
inline-completion provider in place; removing it is what the 2026-06-17 pivot called the "one-way"
step. `stripThink`/`stripFences` survive in `catalog.ts` (Inquire's `extractEditText` composes them).
**Reversibility:** one-way — Completion is deleted, not flag-gated. Reverting means re-implementing it.

## Related

- [[decisions]] — index
