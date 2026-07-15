---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex sign-out must write a tombstone, not delete the slot

`CodexAuth.signOut` stores an empty `{}` to `wisp.codexAuth` instead of `secrets.delete`. If it deleted, the
next `current()`/`isSignedIn()` would **re-import `~/.codex/auth.json`** (a Codex-CLI login) and instantly
re-sign-in — sign-out would never stick for a CLI user. A present-but-bearer-less blob reads as signed-out
*and* suppresses the import. Only an **unwritten** slot (undefined) triggers the one-time auth.json import; a
tombstone does not. Don't "simplify" sign-out back to a delete.

## Related

- [[gotchas]] — index
