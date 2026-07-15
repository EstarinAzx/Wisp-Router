---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# OAuth managers live in core; active ≠ signed-in (#61 / PR #73)

**Decision:** `codexAuth.ts`/`anthropicAuth.ts` moved into `@wisp/core` — the loopback-server
machinery is plain node http and the browser open is injected, so ONE implementation serves
both faces; a TUI-side clone is a closed path. The TUI opens the browser via
`rundll32 url.dll,FileProtocolHandler` on win32 (`cmd /c start` mangles `&` in the OAuth query
under spawn's arg quoting), `open`/`xdg-open` elsewhere; a failed spawn rejects so sign-in
fails fast. Sign-out clears credentials but NEVER the Active Provider selection — "active"
is a routing choice, "signed in" a credential; both faces agree, and the TUI surfaces the
difference as a `signed in / signed out` marker on `/providers` OAuth rows instead of
auto-switching providers.
**Why:** auto-switching on sign-out was considered (user read "(active)" after sign-out as a
bug) and rejected — the extension keeps selection on sign-out, and silently changing the
user's route is worse than showing an unusable-but-selected row.
**Reversibility:** easy — all UI-level; the core move is plain module placement.

## Related

- [[decisions]] — index
