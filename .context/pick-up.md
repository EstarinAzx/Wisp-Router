---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**TUI select transparency fix (`bb6465b`).** opentui's native `<select>` paints an opaque
`#1a1a1a` slab when focused — all eight picker screens now spread a shared `SELECT_COLORS`
const (`packages/tui/src/app.tsx`): transparent fill, `#27272a` selection bar, matching the
hand-rolled WrapSelect routing screens. Verified headless (opentui test renderer span scan)
+ `tsc` + sandbox CLI checks.

## Next task

**None queued — tracker is backlog-only.** Ask the user to pick: #69 (copilot-wisp launcher),
#68 (TUI chat mode), or #57 (ready-for-human PRD umbrella). No default was chosen.
Note: the select fix is source-only — published binary 2.0.11 shows the old look; tag a
release when the next TUI batch lands.

## Landmines

- Any NEW native `<select>` in the TUI must spread `SELECT_COLORS` or it reverts to the opaque
  default — see the comment above the const in `app.tsx`.
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
