---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**TUI split legs 3+4 (relay leg 2).** #117 provider-flow Screens → `src/providerScreens.tsx`
(`a373a70`); #118 routing-flow Screens → `src/routingScreens.tsx` (`62c6aa3`). Shell keeps the
Mode machine, action starters, and keyboard; gates green (spans 32/32, `tsc`, sandbox CLI
smoke). Breadcrumbs on both issues carry the import seams.

## Next task

**#119 — TUI split 5/5: palette, test, info Screens; finish the shell.** An unattended
`/relay N=2 /preset loop-arg` chain may already be working it — check `gh issue list` and
`.claude/loop-arg.md` BEFORE touching anything; don't double-work the ticket. If the chain
died, revive with `/relay N=2 /preset loop-arg`. After #119: close spec #114, then tag a
release (select fix + split are source-only; published binary still 2.0.11).

## Landmines

- Gate for #119 is spans + `tsc` + the scoped `packages/tui:verify` skill (loop goal requires
  it on the final ticket) — never `bun run spans --update` in a move-only change.
- Any NEW native `<select>` must spread `SELECT_COLORS` (home: `src/theme.ts`).
- Screen modules import from `./modes`/`./theme`/`./widgets`/`./providerScreens` — never from
  the shell (circular).
- Slot skill exists TWICE — personal `~/.claude/skills/slot` vs repo `plugins/slot`; fixes go
  to both; never `/plugin install wisp-slot` on this machine
  ([[slot-skill-has-two-copies-personal-vs-plugin]]).
- Never restore a Slot while its agent runs; an accidental bare `wisp` open can rewrite ALL
  family routes ([[accidental-tui-open-rewrites-all-family-routes]]).
- PowerShell env checks lie about bridging — use Bash
  ([[powershell-profile-env-masks-session-env]]).

## Related

- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[happy-path]] · [[gotchas]]
