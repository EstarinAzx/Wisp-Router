---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# The Provider selector is a key-redirect vector — keep it out of workspace reach

The Active Provider selects which base URL the bearer API key is sent to, so it carries the exact
threat the Custom base URL does: anything workspace-overridable lets a hostile repo redirect the key
to an attacker endpoint. Pre-#59 the defense was `"scope": "machine"` on the settings; since #59 both
live in `~/.wisp/config.json`, which no workspace can touch — and the one remaining settings read (the
one-time migration seed) MUST use `inspect().globalValue`, never the merged `get()`, because scope
enforcement died with the settings' registration. Built-in base URLs MUST stay in code (the
`PROVIDERS` catalog). Don't relax any of this without re-reading the 2026-06-15 multi-provider ADR.

## Related

- [[gotchas]] — index
