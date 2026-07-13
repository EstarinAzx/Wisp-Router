---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Slice #47 done + demo-verified — the `feat/anthropic-door` branch is COMPLETE** (7 commits,
`5089a32`→`df83e7d`, NOT pushed). Three things landed:
1. **#47 (`7ee12e9`)** — panel Bridge area grew a Claude Code section: three copy-paste setup variants
   (PowerShell/bash session lines + project `.claude/settings.json` block) built from the live
   address/secret, host-side copy, Bridge-off explainer. No global settings variant (PRD ban).
2. **Effort threading (`15ae28b`)** — user-directed reversal of the "panel effort only" deferral: the door
   now honors Claude Code's `/effort` (`output_config.effort`) over the panel effort; `max`→`xhigh` on
   Codex. Proven live: `[bridge] messages codex effort=max (claude code)` in the Wisp channel.
3. **Label fix (`df83e7d`)** — Bridge discovery labels dropped the frozen "· medium" suffix (was
   DEFAULT_EFFORT fallback); suffix now only where an effort is threaded (in-VS-Code picker).
278 tests green, tsc + vite clean.

## Next task
**Ship the branch: `/preset ship` — push `feat/anthropic-door`, open ONE PR → `main`.** PR closes
**#45 + #46 + #47** (all three still OPEN on GitHub; they close on merge). Compose the body from the
7-commit diff; the door + panel are all demo-verified, nothing is known-broken.

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- **PowerShell is the user's default shell**; `claude` reads env at startup only → fresh terminal after
  any env change.
- **Claude Code's banner "· effort" badge doesn't repaint after `/effort`** — hardcoded upstream UI, no
  knob (docs-checked). Don't burn time trying to remove it; the Wisp log line is the truth.
- **Forced `tool_choice` + `temperature` are still deliberately NOT threaded** (only effort is now). See
  the `ponytail:` note in `bridgeServer.ts` — don't "fix" unasked.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
