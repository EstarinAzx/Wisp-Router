---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (auto)._
_At commit: `71176e8` on `main` (tag `v2.0.11`)._

## Current focus

Spec #107 is fully delivered: routing CLI shipped in the published package (2.0.11) and the
personal Slot skill exists, is TDD-verified, and passed a real bridged end-to-end proof. All
three child tickets (#108, #109, #110) are closed; only the parent spec issue remains open.

## State

- **In flight:** None.
- **Done this session:** #110 closed — Slot skill at `~/.claude/skills/slot/SKILL.md` (spec +
  plan committed here; deliverable + vault page committed in `~/.claude` as `c805764`, template
  mirrored as `9a9df80`). Baseline agents failed the early-restore trap; with the skill 3/3
  pressure tests complied; live proof: bridged `claude-wisp` session ran `/slot`, serve log
  showed `route family 'claude-haiku-4-5…' -> codex model=gpt-5.6-terra`, map restored
  byte-identical, lease deleted. Released **wisp-router 2.0.11** (`71176e8`, tag `v2.0.11`):
  CI green, 4 release assets, npm shell + platform packages verified on the registry, global
  upgraded — `wisp routing` now works published. Ecosystem health run: template 0 findings.
- **Blocked:** None.

## Pick up here

Close parent spec #107 (all children shipped; comment with the 2.0.11 + skill evidence).
Then the tracker is backlog-only: #69 (copilot-wisp launcher) and #68 (TUI chat mode) are
`enhancement`s awaiting a user pick; #57 is the ready-for-human PRD umbrella.

## Open questions

None.

## Recent context

- Slot discipline is settled in [[2026-07-17-slot-skill-lease-file-explicit-restore]]: lease
  file + explicit guarded restore, no SessionEnd hook; Agent model = family words only.
- Two new traps recorded: [[accidental-tui-open-rewrites-all-family-routes]] (hit live during
  verification — repaired same session) and [[powershell-profile-env-masks-session-env]]
  (PowerShell profile claims every session is bridged; use Bash for real env).
- 2.0.11 is the first release whose global install answers `wisp routing` without the TUI —
  the Slot skill's source-checkout fallback is now dormant on this machine.

## Related

- [[overview]]
- [[pick-up]]
- [[api]]
- [[decisions]]
- [[happy-path]]
- [[gotchas]]
