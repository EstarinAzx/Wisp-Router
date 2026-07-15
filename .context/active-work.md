---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Opus 4.8 (auto)._
_At commit: `41da0fb` on `main`; this update = Grok-provider planning (epic #91), no code changed._

## Current focus
**Grok (xAI OAuth) provider is planned and sliced — epic #91, target 2.0.5.** This session ran the `init`
funnel (studied `pi-xai-oauth`, locked decisions D1–D7) and filed a self-promoting ticket chain #92–#98.
No code yet — next session runs the loop. Deferred/background: the 2.0.4 live-terminal checks tests can't
reach (below), and the feature backlog.

## State
- **Done (verified this session):** 2.0.4 release is green end-to-end — tag `v2.0.4` → `31026a7`,
  `packages/tui/package.json` = `2.0.4`, `npm view wisp-router version` → **2.0.4**, and the `release.yml`
  CI run **completed success** (2m29s, run `29390577754`). Pick-up task #1 is closed.
- **Shipped last session (in 2.0.4):**
  - **#87** — content-less Anthropic turns now surface instead of an empty SSE envelope (PR #89 →
    `2008cd8`). `anthropicStream` tracks text/tool deltas + `message_delta` `stop_reason`: truncation
    (`max_tokens`/`content_filter`/`refusal`) → visible marker; truly content-less turn **throws** → door
    writes a real `anthropicErrorFrame`/502; partial content with a lost terminal frame is kept. New pure
    `anthropicTruncationReason` in `catalog.ts`.
  - **#88** — lifted the hardcoded 16K output cap (PR #90 → `5c24299`). Streaming path requests
    `anthropicModelCaps(model).maxOutput` (Opus 128K, Sonnet/Haiku 64K); Inquire keeps bounded
    `INQUIRE_MAX_TOKENS = 16_000`.
  - `bun run test` **387**, vscode `tsc` clean. Full write-up in [[decisions]].
- **Planned this session (no code):** Grok (xAI OAuth) provider — 4th kind `xai-oauth`, epic **#91** →
  slices **#92** catalog · **#93** XaiAuth · **#94** client · **#95** Bridge · **#96** TUI · **#97** VS
  Code · **#98** release. Decisions D1–D7 in [[decisions]] (2026-07-15 "Grok provider planned"). #92 is
  `ready-for-agent`; the chain self-promotes as blockers close. Grok ≠ Groq; client is a Codex-twin.
- **In flight:** none.
- **Blocked:** none.

## Pick up here
**Run the Grok provider loop — `/loop /preset ticket-loop` (self-paced, no interval).** Epic #91; **#92**
is the ready trunk. The chain self-promotes down to #98; each leg reads its blockers' breadcrumbs +
committed code first. Long chain → wrap in `/relay N=6 /preset ticket-loop` for fresh sessions.

Deferred (carried, not blocking the loop) — the 2.0.4 live checks tests can't reach:
1. **Live-confirm #87's residual:** run `claude-wisp`, force/observe a content-less turn, watch the Bridge
   `[bridge]` logs. If a failure logs `[bridge] error anthropic …` but Claude Code **still** shows "empty
   or malformed", the mid-stream error frame isn't honored by the client → **split a smaller sub-issue off
   #87** (confirm signature in [[decisions]]).
2. **Eyeball the FIXED `/bridge` screen** in a real terminal (the `1830600` row-overlap fix — never
   visually verified).
3. Backlog: #68 (chat mode) / #69 (copilot-wisp), or the small orphans below.

Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`; VS Code
extension 1.7.0 release (CHANGELOG Unreleased ready); root `.vsix` pile (ask before purging); panel-side
alias rename (TUI-only today); `.claude/settings.local.json` snippet switch (spec #78 out-of-scope note).

## Skills for next session
- /preset pick-up → resumes the Grok loop (baton in [[pick-up]]). Or go straight to `/loop /preset ticket-loop`.

## Open questions
- (carried) #87 live confirm: does a real content-less failure log `[bridge] error anthropic …` or not? No
  line = the empty-envelope path the guard now throws on (fixed); line present but Claude Code still
  "empty/malformed" = the error frame isn't honored → sub-issue split off #87.
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door Codex
  strict-tools limit; routing-map rename migration — deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.
- (carried) npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI; the shim's release-download fallback keeps installs working.
- (carried) npm token was pasted in-session previously — user should rotate it (repo secret `NPM_TOKEN`).
- (carried) Codex signed out on this machine — `/signin codex` before Codex live checks.

## Recent context
- Tests **387** (`bun run test` at root → `packages/core/tests/`). Core typecheck ignores tests; the
  vscode `tsc -p ./ --noEmit` (in `packages/vscode`) typechecks core through `@wisp/core`.
- The #87/#88 fix touched `packages/core/src/anthropicClient.ts` (`anthropicStream`, `INQUIRE_MAX_TOKENS`)
  + `catalog.ts` (`anthropicTruncationReason`, `anthropicModelCaps` return type); reference guard is
  `codexClient.ts` `codexStream`; door path `bridgeServer.ts` `handleAnthropicMessages`
  (`anthropicErrorFrame` at ~L499); encoder `bridgeAnthropic.ts` `finish()`. Tests in
  `packages/core/tests/anthropic.test.ts`.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).
- Repo labels: `ready-for-agent` (frontier), `ready-for-human`. Ticket-loop is label-gated — **#92 is now
  `ready-for-agent`** (Grok epic #91); the chain self-promotes its dependents on close.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
