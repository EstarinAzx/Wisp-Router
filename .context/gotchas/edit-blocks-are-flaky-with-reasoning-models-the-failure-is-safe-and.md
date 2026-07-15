---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Edit blocks are flaky with reasoning models — the failure is SAFE, and retry usually works

Inquire's SEARCH/REPLACE matching is **exact** (EOL-agnostic only, no whitespace-fuzz). Reasoning models
don't reliably copy code verbatim, so a given run can: return a SEARCH that isn't byte-present → all
blocks miss → **"could not locate the text to edit"**; or return no blocks at all → **"nothing to
change"**. Re-running the same instruction usually yields a matching block (it's model variance, not a
parser bug — confirmed in F5: one run missed, the reload+retry passed). This is **by design** — a miss
is surfaced and skipped, never force-matched, so the file is never corrupted (no data loss). Don't "fix"
the flakiness by loosening to fuzzy/trimmed matching reflexively — that trades a safe miss for a
wrong-region false match. The fuzzy-matching fork is deferred; take it only if misses prove frequent in
real use. The throwaway `[debug]` reply/`trimmedMatch` instrumentation in `inquire` (used to tell
indent-drift from paraphrase) was removed after diagnosis — re-add it the same way if revisiting. See
[[decisions]] 2026-06-17 edit-blocks-built entry.

## Related

- [[gotchas]] — index
