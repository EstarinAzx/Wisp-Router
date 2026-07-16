---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**#107 closed + Slot skill shipped as a plugin.** Spec #107 closed with the evidence comment
(children #108–#110, 2.0.11 release, live bridged proof). Repo now doubles as a Claude Code
plugin marketplace (`fbac359`): root `.claude-plugin/marketplace.json` lists `wisp-slot` from
`plugins/slot/` — a generalized SKILL.md (`~` paths, `$ANTHROPIC_BASE_URL` probe, npm-upgrade
note). Both manifests pass `claude plugin validate`. README: plugin install block added,
`/routing` + `wisp routing` CLI named under Routing aliases, stale Copilot CLI mention removed.

## Next task

**None queued — tracker is backlog-only.** Ask the user to pick: #69 (copilot-wisp launcher),
#68 (TUI chat mode), or #57 (ready-for-human PRD umbrella). No default was chosen.

## Landmines

- Slot skill exists TWICE — personal `~/.claude/skills/slot` (machine-specific) vs repo
  `plugins/slot` (generalized). Procedure fixes go to both; never `/plugin install wisp-slot`
  on this machine ([[slot-skill-has-two-copies-personal-vs-plugin]]).
- Never restore a Slot while its agent runs — Bridge resolves per request; task id ≠ done.
- An accidental bare `wisp` open from an agent can rewrite ALL family routes
  ([[accidental-tui-open-rewrites-all-family-routes]]); diff the map after any TUI mishap.
- PowerShell env checks lie about bridging (profile sets ANTHROPIC_BASE_URL) — use Bash
  ([[powershell-profile-env-masks-session-env]]).
- Family routes bound to `anthropic/*` burn Max quota ([[gotchas]]).

## Related

- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[happy-path]] · [[gotchas]]
