---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (auto)._
_At commit: `bb6465b` on `main` (last release tag `v2.0.11`)._

## Current focus

TUI visual polish landed: all eight native opentui `<select>` screens now render transparent
(`bb6465b`) — matching the hand-rolled WrapSelect routing screens. The tracker remains
backlog-only.

## State

- **In flight:** None.
- **Done this session:** Killed the opaque dropdown slab — opentui's native select defaults to
  an opaque `#1a1a1a` fill when focused (+ `#334455`/yellow selection). One shared
  `SELECT_COLORS` const in `packages/tui/src/app.tsx`, spread into all eight native selects
  (providers, provider-menu, key-pick, model-pick, oauth-pick, help, route-model-pick,
  effort-pick): transparent fill, `#27272a` bar, accent selected text, dim descriptions.
  Verified via headless opentui test renderer (span scan: zero `#1a1a1a`/`#334455` cells) +
  `tsc` + sandbox `wisp routing` CLI checks.
- **Blocked:** None.

## Pick up here

The fix is source-only — the published `wisp-router` binary (2.0.11) still shows the old look;
tag a release when the next batch of TUI work lands. Otherwise tracker is backlog-only — ask
the user to pick: #69 (copilot-wisp launcher, `enhancement`), #68 (TUI chat mode,
`enhancement`), or #57 (ready-for-human PRD umbrella). No default.

## Open questions

None.

## Recent context

- New selects must spread `SELECT_COLORS` — the why lives in the comment above the const in
  `app.tsx` (native select's opaque focused-fill default).
- Plugin distribution settled in [[2026-07-17-slot-skill-ships-as-repo-plugin-marketplace]]:
  repo-as-marketplace, generalized copy under `plugins/slot/`.
- The Slot skill exists twice, deliberately diverged — see
  [[slot-skill-has-two-copies-personal-vs-plugin]]: procedure fixes go to BOTH copies; never
  `/plugin install wisp-slot` on this machine.

## Related

- [[overview]]
- [[pick-up]]
- [[api]]
- [[decisions]]
- [[happy-path]]
- [[gotchas]]
