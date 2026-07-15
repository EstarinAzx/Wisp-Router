---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Config writes must target the defining scope, not always Global

`setModel`/`setProvider`/`setBaseUrl` use `cfg().inspect()` (via `targetFor()`) to write the scope that already defines the value. A blind `ConfigurationTarget.Global` write under a workspace override is silently ineffective and the controlled panel select snaps back. See `targetFor()` in `src/extension.ts`.

## Related

- [[gotchas]] — index
