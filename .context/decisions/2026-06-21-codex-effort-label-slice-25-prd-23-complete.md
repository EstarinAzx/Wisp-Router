---
type: decision
project: wisp
updated: 2026-06-21
tags: [context, decisions]
---

# Codex Effort label (slice #25); PRD #23 complete

**Decision:** The model-picker row mirrors the active Effort: `buildChatModelInfos` appends ` · <effort>`
to a Codex row's name, gated by `isCodexProvider(p) && codexReasoning(model)` — the **same predicate** that
decides whether a reasoning object is sent, so an inert `spark`/`gpt-4.x` row never claims a depth and no
non-Codex row gets a suffix. Effort threaded in as a new optional `state.effort` (fed by `deps.codexEffort()`
at the `chatProvider` call site). Raw lowercase token (`· high`), matching the panel `<select>`. No webview
change; no live-refresh event needed — the picker re-queries `provideLanguageModelChatInformation` on open
(the chatProvider is stateless; confirmed no `onDidChange…` event in the finalized 1.104 API). `npm test`
139 → 141 (+2: reasoning row gets the suffix, spark row does not), tsc+webview clean, F5 PASSED.
**Completes PRD #23.**
**Why:** reusing `codexReasoning`'s gate makes label-honesty == reasoning-honesty for free. The handoff
feared the 13 existing `buildChatModelInfos` tests asserted the Codex row name — they don't (the only Codex
test asserts `capabilities`), so the change was purely additive, no existing test changed.
**Reversibility:** easy (additive suffix + optional `state.effort`).

## Related

- [[decisions]] — index
