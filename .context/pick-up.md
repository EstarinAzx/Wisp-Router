---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**#110 closed + wisp-router 2.0.11 released.** Personal Slot skill lives at
`~/.claude/skills/slot/SKILL.md` (committed `c805764` in `~/.claude`, template-mirrored
`9a9df80`): snapshot → lease → rebind Slot family → spawn Agent via family word → hold →
guarded restore. TDD trail: baseline failed early-restore, 3/3 green with the skill, live
bridged proof via serve route log (`claude-haiku-4-5… -> codex model=gpt-5.6-terra`).
Release `v2.0.11` (`71176e8`): CI green, npm verified, global upgraded — published
`wisp routing` now works without the source checkout.

## Next task

**Close spec #107** — all children (#108, #109, #110) are shipped and closed. Comment with
the evidence (2.0.11 release + Slot skill + live proof) and close. After that the tracker is
backlog-only (#69 copilot-wisp launcher, #68 TUI chat mode); ask the user what's next.

## Landmines

- Never restore a Slot while its agent runs — Bridge resolves per request; task id ≠ done.
- An accidental bare `wisp` open from an agent can rewrite ALL family routes (see
  [[accidental-tui-open-rewrites-all-family-routes]]); diff the map after any TUI mishap.
- PowerShell env checks lie about bridging (profile sets ANTHROPIC_BASE_URL) — use Bash
  (see [[powershell-profile-env-masks-session-env]]).
- Family routes bound to `anthropic/*` burn Max quota ([[gotchas]]).

## Related

- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[happy-path]] · [[gotchas]]
