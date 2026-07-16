---
type: gotcha
project: wisp
updated: 2026-07-16
tags: [context, gotchas]
---

# Claude Code Advisor is endpoint-gated — can't route through Wisp, no code fix

Claude Code's Advisor won't work through a wisp-launched session even when the Family routes
are bound to Claude OAuth: the feature is **endpoint-gated upstream**, its calls never go
through the Bridge, and no fix exists on Wisp's side. Don't burn time trying to route it —
the answer is **native `claude` for advisor tasks**. `/bridge` shows an amber warning to this
effect since `wisp-router@2.0.9` (the warning row is hand-wrapped, no ⚠ glyph — ambiguous-width,
smears on common Windows fonts).

## Related

- [[gotchas]] — index
