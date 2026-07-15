---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Two Wisp extensions at once → "already registered" warnings + a stale panel (F5 vs installed VSIX)

F5 launches the dev build (`EsarinAzx.wisp` — current `package.json` publisher) while an **old installed
VSIX** is still enabled. The actual stale id was **`local.opencode-autocomplete@0.0.4`** ("OpenCode Zen
Autocomplete" — this project from BEFORE the Wisp rename), **not** `local.wisp` (that was never installed;
earlier notes guessed wrong). Confirmed + uninstalled 2026-06-24 via `code --list-extensions`. Different
extension ids but the **same `wisp.model` / `wisp.baseUrl` / `wisp.provider` setting keys**, so VS Code logs
**"Cannot register 'wisp.X' — this property is already registered"** (blamed on whichever loads second), and
the side panel you see may be the **stale installed build** — none of the new UI (e.g. the Effort knob) shows.
Not a code bug, a dev-environment dup. Fix: list installed extensions and **uninstall the stale local one
before F5** — `code --list-extensions | grep -E 'wisp|opencode'` then `code --uninstall-extension <id>` —
then stop the debug session and F5 again. Disappears once a single published extension id exists.
(`wisp.effort` is globalState, not a contributed setting, so it never collides.)

## Related

- [[gotchas]] — index
