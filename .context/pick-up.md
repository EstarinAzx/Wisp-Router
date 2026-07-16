---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**#109 merged and closed** — PR #112 squash-merged to `main` as `08b45f8`. `wisp routing set <row> <target>` and `unset <row>` now edit the shared map with core validation, first-slash parsing, advisory credential warnings, and atomic persistence. Merged-main verification: 464/464 tests and both TypeScript checks clean; one live isolated Bridge stayed running while its next Haiku request changed Targets.

## Next task

**#110 — personal Slot skill.** Run `/preset scope 110`; read #110 + parent spec #107. Build under `~/.claude/skills/`, not this repo. Default Slot = `haiku`, configurable family; snapshot before set; surface any `warning:` before spawning; restore only after the Slot-driven agent finishes. Check ecosystem-kb decisions before adding it, then verify a real bridged subagent and restore the original map.

## Landmines

- Never restore a Slot while its agent is still running: routing resolves per request, so early restore silently reroutes that agent's next turn.
- Aliases do not appear in Claude Code's fixed Agent-model enum; the skill must use a Family route.
- Preserve the exact pre-run binding, including an originally-unset Family route.
- The installed global `wisp` binary needs a release containing #109 before the personal skill can rely on it outside source checkout.

## Related

- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[happy-path]] · [[gotchas]]
