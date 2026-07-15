---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Don't make the Inquire edit span the whole file — the model mangles untouched code

Inquire sends the whole file as **context** but the edit replaces only the **target span** (selection /
current-line). A mid-session experiment widened the no-selection span to the whole file so the model
could "edit anywhere" — but a whole-file **re-emit** makes the model drop/reformat unrelated lines; the
B2 diff faithfully renders the damage and **Accept would apply it → data loss**. `diffLines` is correct
(it showed a minimal diff of a mangled reply). Caret-agnostic "edit anywhere" is delivered safely by the
**SEARCH/REPLACE edit-blocks** slice (#8), which emits only changed regions. Don't reintroduce whole-file
re-emit as the edit path. See [[decisions]] 2026-06-17 edit-fidelity entry.

## Related

- [[gotchas]] — index
