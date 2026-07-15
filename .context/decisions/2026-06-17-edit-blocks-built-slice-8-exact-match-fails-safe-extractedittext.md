---
type: decision
project: wisp
updated: 2026-06-17
tags: [context, decisions]
---

# Edit blocks built (slice #8): exact match, fails safe; extractEditText retired

**Decision:** Built the SEARCH/REPLACE path. `parseEditBlocks` (Aider markers, strips `<think>`,
CRLF→LF, ignores surrounding fences/prose, empty REPLACE = delete) + `applyEditBlocks` (EOL-agnostic
first-occurrence locate+splice, returns the applied text + a `notFound` list, empty-search guarded) are
new pure cores in `catalog.ts`, TDD'd (35/35). `buildEditPrompt` lost its `selectionText` arg and got a
block-eliciting `EDIT_SYSTEM_PROMPT`. `inquire` now parses → applies → diffs the **whole document**
before/after through the unchanged B2 `renderInlineDiff`. **Match policy is exact** (EOL-agnostic only),
**not** whitespace-fuzzy. `extractEditText` + `stripFences` were **removed** (orphaned by the switch to
`parseEditBlocks`); `stripThink` survives (reused) — this **supersedes** the slice-#5 note that said
"stripThink/stripFences survive… extractEditText composes them."
**Why exact + fails-safe:** a SEARCH that isn't byte-present is recorded in `notFound` and skipped, never
force-matched — so a bad/paraphrased block can't corrupt the file; the user reviews what landed via the
diff. Whitespace-fuzzy matching was deferred because it adds a false-match (wrong-region) risk class for
marginal gain. The whole-document diff **span** is safe (unlike the reverted whole-file *re-emit*):
`applyEditBlocks` copies untouched code verbatim, so `diffLines` emits a minimal diff.
**Reversibility:** easy. The deferred fork (add trimmed-line/fuzzy matching) stays open — take it only if
real use shows verbatim misses are frequent (see [[gotchas]]). Don't re-add `extractEditText`/whole-file
re-emit.

## Related

- [[decisions]] — index
