---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Opus 4.8 (auto)._
_At commit: de0b048 on `main`. Working tree: clean (this wrap-up commits only `.context/`)._

## Current focus
**Diagnosis session — no code diff.** Diagnosed the intermittent `claude-wisp` error
*"API returned an empty or malformed response (HTTP 200)"* → root cause is **our end** (the
Anthropic door forwards a content-less upstream turn as an empty SSE envelope; the Codex sibling
path was already hardened, the Anthropic path never got the guard). Filed two tickets. Prior
release **2.0.3 is still unverified** — carried, not done.

## State
- **Done this session:**
  - **Diagnosis** of the empty/malformed-200 error (full write-up in [[decisions]] 2026-07-15).
    Bridge `[bridge]` log signature to confirm which path fired is noted in the tickets + decision.
  - **Ticket #87** — *Surface content-less Anthropic turns instead of an empty SSE envelope*
    (`ready-for-agent`, no blockers → on the frontier). Port `codexStream`'s empty/truncation guard
    to `anthropicStream`; surface a diagnostic (`anthropicErrorFrame` / 502 / synth notice) instead
    of a silent empty envelope; tests for empty / thinking-only / max_tokens / abrupt-partial.
  - **Ticket #88** — *Lift the hardcoded 16K output cap on the Anthropic OAuth stream* (blocked by
    #87). **Ungated on purpose** — `ready-for-agent` REMOVED so the loop can't grab blocked work;
    a breadcrumb comment carries the promote command.
- **In flight / carried:** Release workflow run 29383784428 (v2.0.3) — still unverified.
- **Blocked:** #88 (by #87).

## Pick up here
1. **Loop the fix:** `/loop /preset ticket-loop` (or `/relay 30m N=8 /preset ticket-loop` for a
   long run) — grabs **#87** (only frontier ticket). When #87's PR merges, promote #88:
   `gh issue edit 88 --repo EstarinAzx/Wisp-Router --add-label ready-for-agent`.
2. **Still pending — verify 2.0.3** (carried from last session, NOT superseded): `gh run view
   29383784428` green → `npm view wisp-router version` → 2.0.3 → platform probe (Open questions).
   Then eyeball the FIXED `/bridge` screen in a real terminal — the 1830600 fix is unverified visually.
3. Then the backlog: #68 (chat mode) / #69 (copilot-wisp), or the small orphans below.

Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`;
VS Code extension 1.7.0 release (CHANGELOG Unreleased ready); root `.vsix` pile (ask before
purging); panel-side alias rename (TUI-only today); `.claude/settings.local.json` snippet
switch (spec #78 out-of-scope note).

## Skills for next session
- /preset pick-up → then `/loop /preset ticket-loop` for #87. /preset catch-up only if this note is stale.

## Open questions
- (new) #87 confirm step: does the failure log show `[bridge] error anthropic …` or not? No line =
  empty-envelope path (the ticket's target); line present but Claude Code still "empty/malformed" =
  the mid-stream error frame isn't honored → split a smaller sub-issue off #87.
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.
- (carried) npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI; the shim's release-download fallback keeps installs working.
- (carried) npm token was pasted in-session previously — user should rotate it (repo secret `NPM_TOKEN`).
- (carried) Codex signed out on this machine — `/signin codex` before Codex live checks.

## Recent context
- Tests **376** (`bun run test` at root → `packages/core/tests/`). Core typecheck ignores tests.
- The fix touches `packages/core/src/anthropicClient.ts` (`anthropicStream`, `ANTHROPIC_MAX_TOKENS`);
  reference guard is `codexClient.ts` `codexStream` (~L105-119); door path
  `bridgeServer.ts` `handleAnthropicMessages`; encoder `bridgeAnthropic.ts` `finish()`. Tests land in
  `packages/core/tests/anthropic.test.ts`.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).
- Repo labels: `ready-for-agent` (frontier), `ready-for-human`. Ticket-loop is label-gated — a blocked
  ticket must NOT carry `ready-for-agent` (why #88 is bare).

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
