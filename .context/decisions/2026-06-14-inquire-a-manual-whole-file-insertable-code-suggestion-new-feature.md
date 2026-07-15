---
type: decision
project: wisp
updated: 2026-06-14
tags: [context, decisions]
---

# Inquire: a manual, whole-file, insertable-code suggestion (new feature)

**Decision:** Add **Inquire** (see `CONTEXT.md`) — select lines → right-click → the selection is the
prompt, the **whole file** is context, and the result is **insertable code** rendered as ghost text
**after** the selection (append, never replace). It is **code only, never prose**, **independent of
the `enabled` toggle**, and reuses the existing ghost-text surface + cleanup pipeline. Mechanic: stash
a pending result and fire `editor.action.inlineSuggest.trigger`; the inline provider returns it before
the enabled/selection/debounce/cache gates. Whole-file context has a ~32k-char size guard that falls
back to a windowed `buildContext`. Feedback = cancellable `withProgress` + existing Activity. Spec in
`PRD.md`; build in `issues.md` Issue 2.
**Why:** the user wants the answer to feel exactly like an autocomplete suggestion (ghost text, Tab),
so reusing Completion's surface beat a new panel/hover UI. **Code-only** (rejecting prose Q&A / chat):
prose can't live in ghost text and would need a different surface + interaction model — out of scope.
**Append, not replace** (rejecting transform-in-place): a loose reasoning model returning junk must
never destroy the user's selected code, matching the pipeline's fail-safe "never deletes code" ethos.
**Whole file with a guard** (vs Completion's prefix/suffix cap): the whole point is full-file context,
but an unbounded send overflows the model context window on big files — the guard degrades gracefully.
**Reversibility:** easy to remove the command; but don't quietly turn Inquire into prose Q&A or a
replace-mode without re-deciding — both were rejected paths (data-loss / wrong-surface).
**Risk (unproven):** the manual ghost-text trigger (`inlineSuggest.trigger` + stashed result at a
collapsed caret) is keystroke-driven by default — Issue 2 validates it with a spike before building.

## Related

- [[decisions]] — index
