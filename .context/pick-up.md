---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**The Anthropic door SHIPPED — v1.5.0 (pre-release).** Branch `feat/anthropic-door` (slices #45/#46/#47 +
effort threading + label fix, all demo-verified vs real Claude Code) was PR'd to `main`, merged, tagged
`v1.5.0`, and released on GitHub as a **pre-release** with the `.vsix` attached. Issues #45/#46/#47 closed
on merge. CHANGELOG got the 1.5.0 entry (+ a 1.4.3 backfill); README's Bridge section now documents both
dialects + the Claude Code setup snippets. PRD #43 is fully delivered.

## Next task
**None queued — the slate is clean. Next session is open for new PRDs** (`/preset init` for a fresh idea,
or `/preset catch-up` to orient). Optional known follow-ups if nothing new lands:
- Agent-mode vision flake (root cause not pinned — see active-work Open questions).
- `handleAnthropicChat` outbound image drop (Bridge OpenAI door).
- OpenAI-door Codex path still sends strict tools (same limit #46 fixed on the Anthropic door).
- Forced `tool_choice` + `temperature` carried but not threaded (deliberate — don't fix unasked).

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- **PowerShell is the user's default shell**; `claude` reads env at startup only → fresh terminal after
  any env change.
- **v1.5.0 is marked pre-release** — promote to a full release only after real-world soak.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
