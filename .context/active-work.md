---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (auto)._
_At commit: `08b45f8` on `main`._

## Current focus

Routing CLI primitives are complete: Claude Code or shell automation can snapshot, set, and unset live Routing-map bindings without restarting the Bridge. Next frontier is #110, the personal Slot skill that turns those primitives into the rebind → spawn → restore workflow.

## State

- **In flight:** None.
- **Done this session:** #109 merged through PR #112 as `08b45f8` and closed. Added validated Family/Alias `set` and `unset`, first-slash target parsing, credential warnings that still write, atomic home-store persistence, tests, and TUI README docs.
- **Blocked:** None. #110 was blocked by #109 and is now ready.

## Pick up here

Run `/preset scope 110`, then read GitHub #110 + parent spec #107. The deliverable is a personal skill under `~/.claude/skills/`, not repository source: Bridge-up check → snapshot → rebind a configurable Slot (default `haiku`) → spawn Agent with that family enum → restore only after the Slot-driven agent has finished. Consult the ecosystem-kb decisions before adding the skill. Verify once against a real bridged Claude Code subagent and restore the original map.

## Skills for next session

- `superpowers:brainstorming` — confirm #110 boundaries against the settled parent design before planning.
- `superpowers:writing-plans` — turn the skill acceptance criteria into an executable plan.
- `superpowers:writing-skills` — create and validate the personal Slot skill in the established skill format.
- `verify` — exercise the real bridged rebind/spawn/restore flow end to end.

## Open questions

None. Choose a credential-ready Target during implementation for the real end-to-end proof.

## Recent context

- `wisp routing set <row> <provider>/<model>` splits on the first slash, so slashed Provider-native model ids survive.
- Missing API key or OAuth sign-in prints a stable `warning:` line but still writes and exits zero.
- Refused edits return non-zero and leave config.json unchanged; unknown Alias unset is a no-op.
- Live isolated proof kept one Bridge process running while identical Haiku requests changed from `before-model` to `after-model` on the next request.
- Merged-main verification: 464/464 core tests; core typecheck and TUI compile clean.

## Related

- [[overview]]
- [[pick-up]]
- [[api]]
- [[decisions]]
- [[happy-path]]
- [[gotchas]]
