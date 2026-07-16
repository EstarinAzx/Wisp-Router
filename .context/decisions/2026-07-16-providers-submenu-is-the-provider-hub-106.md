---
type: decision
project: wisp
updated: 2026-07-16
tags: [context, decisions]
---

# /providers submenu is the provider hub (#106)

**Decision.** Enter on a `/providers` row opens that provider's action menu instead of setting
it active directly: "Use as Active Provider" is the first row (set-active stays Enter-Enter),
keyed rows add "Set API key" + "Remove key" (the remove row only appears when a stored key
exists — env-var keys aren't stored, nothing to remove), OAuth rows add "Sign in" (live status)
+ "Sign out". Actions land back on the provider list; Esc steps back one level (entry/wait →
menu → list → palette), mirroring the `/routing` chain. Keyed list rows show `key set` /
`env key` alongside the OAuth rows' signed in/out. `/key`, `/signin`, `/signout` stay unchanged
— the menu is additive, not a replacement. Shipped in `wisp-router@2.0.9`.

**Why.** Managing a provider took two slash flows that each walked their own provider list
(`/providers`, then `/key` or `/signin`) — redundant navigation; and no key-removal path
existed at all (a saved key lingered in auth.json forever).

**Reversibility.** Easy — TUI-only screen state in the app's mode machine; core and the slash
registry untouched.

## Related

- [[decisions]] — index
