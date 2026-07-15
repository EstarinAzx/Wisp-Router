---
type: decision
project: wisp
updated: 2026-06-15
tags: [context, decisions]
---

# Inquire built; spike confirmed (resolves the 2026-06-14 unproven risk)

**Decision:** Inquire shipped in `src/extension.ts` + `package.json` (v0.0.4). The manual ghost-text
mechanic **works**: collapse the selection (inline ghost text will not render while a selection is
active), stash `pendingInquiry` keyed to document URI + collapsed caret, fire
`editor.action.inlineSuggest.trigger`; the provider returns the stash from an **early-return ahead of
all gates** (enabled/selection/debounce/cache) and clears it. Whole-file context with a 32k-char guard
falls back to `buildContext(24000/6000)`. Eyeball/F5 verified.
**Why:** this closes the "Risk (unproven)" flagged 2026-06-14 — the keystroke-driven concern was
unfounded; `inlineSuggest.trigger` queries the provider on demand regardless of our `enabled` flag (it
gates on VS Code's own `editor.inlineSuggest.enabled`, default on). Don't re-litigate the surface.
**Reversibility:** easy (remove the command + early-return) — but the append-only / code-only / before-
gates constraints stay load-bearing; see the 2026-06-14 entry.

## Related

- [[decisions]] — index
