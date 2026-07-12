---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Bridge Anthropic door — full `/preset init` funnel, design settled, tracker seeded. No code written.**
The Bridge gets a second front door speaking Anthropic Messages so Claude Code routes through Wisp
providers (headline: Codex OAuth / ChatGPT subscription inside Claude Code). Published on
`EstarinAzx/Wisp-Router` (repo renamed from `Wisp` — old URLs redirect):
- **PRD #43** (`ready-for-agent`) — spec + golden path; MVD also in `.context/happy-path.md`.
- **Slices #44 → #47**, linear chain of blockers: gate → pure translator → wire live → panel snippet.
- **#34 closed** as shipped. `CONTEXT.md` Bridge term now covers both dialects + the fallback rule.
- Full decision record: `.context/decisions.md` 2026-07-13 entry.

## Next task
**Slice #44 — the gate.** Canned `/v1/models` (mix plain `wisp-*` and `claude-wisp-*` ids) + echo
`/v1/messages` mounted on the running Bridge; point a real Claude Code session at it via the env snippet
(`ANTHROPIC_BASE_URL`, secret, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`); record as an issue comment:
picker-filter verdict, which auth header arrived, `system` array shape, main + background-tier model strings.
Enter with `/preset scope 44`.

## Landmines
- **Claude Code reads env at startup only** — every env change needs a fresh terminal/`claude` restart.
- **Never suggest the global `~/.claude/settings.json` env block** — highest precedence, silently reroutes
  every Claude Code session (including the user's real-subscription ones). Per-session shell line or
  project-scoped `.claude/settings.json` only. Banned in PRD #43 + slice #47.
- **Active-Provider fallback already exists on the Bridge** (prior session, verified with the real Copilot
  binary) — slice #46 reuses it; don't build new routing.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap serves a stale panel).
- Older carry-overs: agent-mode vision flake still OPEN (probe plan in `active-work.md`);
  `handleAnthropicChat` outbound image drop; Copilot catalog-warning env vars. All optional.

## Related
- [[active-work]] · [[overview]] · [[happy-path]] · [[decisions]]
