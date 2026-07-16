---
type: active-work
project: wisp
updated: 2026-07-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-17 by Fable 5 (auto)._
_At commit: `fbac359` on `main` (last release tag `v2.0.11`)._

## Current focus

Spec #107 is **closed** (evidence comment: children #108–#110 shipped, 2.0.11 release, live
bridged proof). The Slot skill is now also publicly installable: the repo doubles as a Claude
Code plugin marketplace shipping `wisp-slot` (`fbac359`). The tracker is backlog-only.

## State

- **In flight:** None.
- **Done this session:** Closed spec #107 with the evidence comment. Shipped the Slot skill as
  plugin `wisp-slot`: root `.claude-plugin/marketplace.json` + `plugins/slot/` (manifest +
  generalized SKILL.md — `~` lease path, `$ANTHROPIC_BASE_URL` probe, npm-upgrade note instead
  of the source-checkout fallback); both manifests pass `claude plugin validate`; README gained
  the install block (`/plugin marketplace add EstarinAzx/Wisp-Router` →
  `/plugin install wisp-slot@wisp-router`). README also fixed: `/routing` + `wisp routing` CLI
  named under Routing aliases; unimplemented Copilot CLI reference dropped from "What is Wisp".
- **Blocked:** None.

## Pick up here

Tracker is backlog-only — ask the user to pick: #69 (copilot-wisp launcher, `enhancement`),
#68 (TUI chat mode, `enhancement`), or #57 (ready-for-human PRD umbrella). No default.

## Open questions

None.

## Recent context

- Plugin distribution settled in [[2026-07-17-slot-skill-ships-as-repo-plugin-marketplace]]:
  repo-as-marketplace, generalized copy under `plugins/slot/` — reverses #107's out-of-scope
  line by explicit user call.
- The skill now exists twice, deliberately diverged — see
  [[slot-skill-has-two-copies-personal-vs-plugin]]: procedure fixes go to BOTH copies; never
  `/plugin install wisp-slot` on this machine.
- Slot discipline itself is settled in [[2026-07-17-slot-skill-lease-file-explicit-restore]]:
  lease file + explicit guarded restore, no SessionEnd hook; Agent model = family words only.

## Related

- [[overview]]
- [[pick-up]]
- [[api]]
- [[decisions]]
- [[happy-path]]
- [[gotchas]]
