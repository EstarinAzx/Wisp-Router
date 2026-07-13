---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 by Fable 5._
_SHIPPED: `feat/anthropic-door` merged to `main`, tagged `v1.5.0`, GitHub **pre-release** with `.vsix`. #45/#46/#47 closed. No task queued — next session opens on new PRDs._

## Current focus
**Bridge Anthropic door — route Claude Code through Wisp providers. PRD #43. BRANCH COMPLETE.**
The door is live and proven end-to-end against real Claude Code: `/model` lists Wisp providers, Codex OAuth +
keyed OpenCode Go both stream and tool-round-trip, the panel serves copy-paste setup snippets, and Claude
Code's `/effort` now drives the backend.

## State
- **Done this session (3 commits on `feat/anthropic-door`):**
  - **Slice #47 (`7ee12e9`) — panel Claude Code setup section.** `buildClaudeCodeSnippets` (pure, tested in
    `bridgeAnthropic.ts`) → three variants (PowerShell / bash per-session lines, project
    `.claude/settings.json` env block) rendered in the Bridge section while running, Copy per variant
    (host-side rebuild — webview only names the variant), Bridge-off explainer, restart-claude hint. No
    global `~/.claude/settings.json` variant anywhere (PRD ban). Demo-verified: copy → fresh terminal →
    `claude` reached the door.
  - **Effort threading (`15ae28b`) — user-directed, reverses the "panel effort only" deferral.** The door
    reads `output_config.effort` (where Claude Code's `/effort` rides), validated against the ladder;
    overrides the panel effort for the door's Codex + Anthropic sends (`max` folds to `xhigh` on Codex).
    Absent/junk → panel effort as before. One log line per door call names which effort won
    (`[bridge] messages codex effort=max (claude code)`) — demo-verified live at xhigh/high/max.
  - **Label fix (`df83e7d`) — Bridge discovery labels drop the effort suffix.** `buildChatModelInfos` was
    falling back to DEFAULT_EFFORT when no effort threaded → both doors' lists pinned "· medium" forever.
    Suffix now only when the caller threads an effort: in-VS-Code Copilot picker keeps it (live panel
    value), Bridge doors stay bare. Demo-verified: `/model` shows `Codex — gpt-5.6-sol` clean.
  - **278 unit tests green, tsc + vite clean, `out/` + `dist/` rebuilt.**
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
1. **Nothing queued — PRD #43 fully delivered and released (v1.5.0 pre-release).** New PRDs enter via
   `/preset init`.
2. Older optional follow-ups (unchanged): agent-mode vision flake (Open questions), `handleAnthropicChat`
   outbound image drop, Copilot catalog-warning env vars, and the OpenAI-door Codex path's strict-tool limit
   (same as #46's fix, deferred — Copilot's tools may be simpler).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset init — start a fresh PRD (the expected door).

## Open questions
- **Still deferred by design:** forced `tool_choice` + `temperature` are carried on `parsed` but NOT
  threaded (each backend's tool_choice API differs) — the background tip call degrades to a no-op. Effort
  is no longer deferred (threaded this session). See `ponytail:` note in `bridgeServer.ts`.
- **Claude Code's banner "· model · effort" suffix doesn't repaint after `/effort`** — hardcoded Claude
  Code UI, no knob (checked docs via claude-code-guide agent). The Wisp log line is the truth; `/feedback`
  upstream is the only lever. Not ours.
- **Agent-mode vision intermittent — root cause NOT pinned (OPEN, pre-existing).** Plain/Ask mode reads
  images reliably; agent mode sometimes answers "attachment empty". To resolve: re-add the probe in
  `chatProvider.ts` `provideLanguageModelChatResponse`, F5, reproduce a FAILURE, read the pair.

## Recent context
- **`Ctrl+R` runs the stale build** — `npm run compile` first, or full stop→F5. See [[gotchas]].
- **Model routing:** the door sends **Wisp's** configured Provider model (`resolveModel`), NOT Claude Code's
  picked id — the inbound `model` only routes (named id → Provider, unknown/raw `claude-*` → Active Provider).
- Claude Code gateway contract (empirical, issue #44 comments): `x-api-key`←`ANTHROPIC_API_KEY`,
  `Bearer`←`ANTHROPIC_AUTH_TOKEN`, `anthropic-version` on every call (the dialect-flavoring signal), discovery
  needs `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, env read at startup only (fresh terminal after change).

## Related
- [[overview]]
- [[happy-path]] — both Bridge golden paths (Copilot door + Anthropic door)
- [[api]] — Bridge endpoints incl. the LIVE Anthropic door (#45–#47) + panel state shape
- [[decisions]] — 2026-07-13 effort threading (reverses the panel-effort deferral) + non-strict Codex door tools
- [[gotchas]] — stale-build trap, non-strict door tools, PowerShell curl trap, F5 dup trap
