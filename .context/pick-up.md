---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**wisp-router 2.0.10 released and VERIFIED** — #111 prompt-caching fix (`e5ec476`):
the Bridge had dropped Anthropic `cache_control`, making bridged Claude.ai OAuth sessions burn
~5-10x native plan usage. Wisp now places two ephemeral breakpoints (last system block, final
message block). Live proof: turn 1 cache-write 9122 tokens; turn 2 cache-read all 9122. Suite
437/437, extension + TUI tsc clean; release bump `6812751`, tag `v2.0.10`; npm shell + 4
platform packages + GitHub assets confirmed live.

Also planned **Routing CLI + Slot skill**: spec #107, tickets #108→#109→#110; Slot added to
`CONTEXT.md`; MVD added to `.context/happy-path.md`.

## Next task
**#108 — `wisp routing` show + `--json` snapshot** (unblocked, `ready-for-agent`). Then #109
(set/unset + validation/credential warning), then #110 (personal Slot skill in
`~/.claude/skills/`). Use `/preset scope 108`.

## Landmines
- User must update installed wrapper: `npm i -g wisp-router@2.0.10`, then restart Bridge.
  Earlier binaries retain the cache-burn bug.
- Even after #111, routes pointing at `providerId:'anthropic'` still bill the Claude Max plan
  (now at native cache weight). Claude Code background haiku calls burn Max even when main
  `/model` is a Codex alias — rebind haiku off `anthropic` for a truly Anthropic-free session.
- **Slot restore waits for session end, never mid-agent** — routing resolves per request; early
  restore silently re-routes the live agent.
- **Never tag extension `v1.7.0`** — `release.yml` fires on every `v*` and expects the TUI
  package version. Marketplace publish is VSIX/vsce only.
- TUI chrome: every chrome row `wrapMode="none"` + `flexShrink={0}` (or PANEL).
- Provider files stay one-way: import ONLY from `./shared` (+ `import type { Provider }`).
- New tsconfigs need `"types": ["node"]` (TS 7 drops auto-include).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[happy-path]]
