---
type: decision
project: wisp
updated: 2026-06-17
tags: [context, decisions]
---

# Inquire edit fidelity: SEARCH/REPLACE edit blocks (supersedes whole-file rewrite)

**Decision:** Inquire will ask the model for targeted **SEARCH/REPLACE edit blocks**, not a span/whole-
file rewrite. The model gets whole-file context + the instruction and returns one or more blocks (exact
original snippet → replacement); Wisp locates each SEARCH text in the document, applies the replacement,
then renders the result through the **existing B2 inline diff** (`diffLines` + decorations + Accept/
Reject). New pure core (a block parser + an apply planner) in `catalog.ts`, TDD'd. Planned as a **new
slice (#8)**, built **before** the deferred bonus (#7).
**Why:** a mid-session experiment made no-selection Inquire target the **whole file** so the model could
edit anywhere (caret-agnostic — the user's ask). It worked sometimes, but the model frequently re-emitted
the 100+ line file with unrelated lines dropped/reformatted; the B2 diff faithfully showed the damage and
**Accept would have applied it → data-loss risk**. Edit blocks give the same "edit anywhere" capability
**without** re-emitting untouched code: only changed regions are emitted, so untouched code is
structurally preserved, diffs stay small, latency/tokens drop. Standard robust approach (Aider/Cursor).
The whole-file span change was **reverted**; B2 ships on the selection/current-line span (its documented
scope). `diffLines` itself was unaffected (it correctly showed a minimal diff of a mangled reply).
**Reversibility:** easy — the block format + parser are additive. Don't reintroduce whole-file re-emit as
the edit path; it's the confirmed mangling / data-loss vector.

## Related

- [[decisions]] — index
