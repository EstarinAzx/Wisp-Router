---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# VS Code `wisp.*` settings are dead knobs (except maxTokens/temperature)

Editing `wisp.provider`/`wisp.baseUrl`/`wisp.model`/`wisp.bridge.*` in settings.json does nothing
since #59 — state lives in `~/.wisp/config.json` (hand-edit THAT; the extension watches it). Old
entries linger in users' settings.json as "unknown setting" — harmless, deliberately not auto-removed
(updating unregistered keys isn't reliably allowed).

## Related

- [[gotchas]] — index
