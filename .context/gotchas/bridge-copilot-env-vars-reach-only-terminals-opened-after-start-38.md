---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Bridge `COPILOT_*` env vars reach only terminals opened AFTER Start (#38)

`context.environmentVariableCollection` applies at **terminal creation**, so a terminal already open when you
click Start keeps the old (empty) env and won't see the Bridge — open a **fresh** terminal after Start, or
relaunch it (VS Code shows a stale-env warning icon on the tab). Two more: the collection is `.persistent` by
default, so Wisp `clear()`s it **on activate** as well as on stop (else a reload re-applies last session's
dead-port `BASE_URL` + stale secret while the Bridge is OFF) — don't drop that activate-time clear; and
`COPILOT_MODEL` re-syncs on a Provider **or** model switch while running (#b), so a **new** terminal picks up the
current choice. All three Provider kinds (keyed/codex/anthropic) answer over the Bridge now.

## Related

- [[gotchas]] — index
