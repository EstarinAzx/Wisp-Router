---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Routing map edits are pure core fns; refusal = undefined (#65 / PR #77)

**Decision:** the Routing map's edit operations live in core `routing.ts` as pure functions -
`withFamilyRoute` / `withAlias` / `withoutAlias` - each returning the NEXT map or `undefined`
when refused (dangling Provider id; empty or Provider-id-shadowing alias name). Both faces
persist only a returned map: the extension's `setFamilyRoute`/`setAlias`/`removeAlias` are now
thin delegates, and the TUI's /routing screens call the same fns. UI-side prechecks (webview
collision message, TUI alias-name screen) are messaging only - the pure fn is the trust boundary.
**Why:** #65 acceptance required Vitest-covered pure edits; duplicating the guards per face is
how the two faces drift. `refused = undefined` (not returning the input map) keeps refusal
distinguishable without an error channel.
**Reversibility:** easy (additive extraction) - but keep new edit kinds in core, not in a face.

## Related

- [[decisions]] — index
