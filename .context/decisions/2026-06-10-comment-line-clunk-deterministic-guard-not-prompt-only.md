---
type: decision
project: wisp
updated: 2026-06-10
tags: [context, decisions]
---

# Comment-line clunk: deterministic guard, not prompt-only

**Decision:** Stop the model from extending a comment line with a **deterministic** post-clean guard
(`relocateAfterComment` in `src/extension.ts`), not by the system prompt alone. It fires only when the
caret is at the **physical end of a whole-line comment** (the comment token is the first non-whitespace
char) in a **known code language** (`LINE_COMMENT` map; unknown languageId → never fires), then forces
real code onto its own indented line and drops leading comment-continuation prose. It **fails safe** —
returns the suggestion untouched in every ambiguous case and never deletes code. The `SYSTEM_PROMPT`
format/newline rules stay as a best-effort backup.
**Why:** the served models are reasoning models that obey format instructions only loosely, so a prompt
cannot *guarantee* the comment is never extended. A multi-agent adversarial design pass (3 approaches ×
5 lenses) broke **every** naïve detector: a `//`/`#` found anywhere on the line false-positives on URLs
(`https://`), regex (`/\/\//`), shell `${var#…}`, YAML `url#frag`, Python docstrings, and JSDoc/block
bodies; defaulting `//` onto every language mangles markdown/plaintext (the provider matches `**`); a
trim-based end-of-line check misfires on mid-comment authoring. The **whole-line-comment + physical-EOL +
known-language** trio is the minimal set of gates that rejects all of those. Verified by an 11-case
harness (real bug + each adversarial break) — 11/11.
**Reversibility:** easy to remove, but don't weaken the gates to `indexOf('//')` / a `//` default / a
`trim()`-based EOL test — each reintroduces a confirmed false-positive class. Block comments are
deliberately out of scope (see [[gotchas]]).

## Related

- [[decisions]] — index
