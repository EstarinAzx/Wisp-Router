---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Opus 4.8 (auto)._
_At commit: `5c24299` on `main` (before the 2.0.4 release commit + `.context/` wrap-up)._

## Current focus
**Shipped the empty/malformed-200 fix (#87 + #88), releasing wisp-router 2.0.4.** Both PRs merged to
`main`; the release is being cut this session. What remains is **verification** — the release run, and
two things only a live/real-terminal run can confirm.

## State
- **Done this session:**
  - **#87** — *Surface content-less Anthropic turns instead of an empty SSE envelope* (PR #89 →
    `2008cd8`). `anthropicStream` now tracks text/tool deltas + reads `message_delta` `stop_reason`:
    a truncation reason (`max_tokens`/`content_filter`/`refusal`) surfaces as a visible marker; a truly
    content-less turn **throws** → the door writes a real `anthropicErrorFrame`/502 instead of the silent
    empty envelope; partial content whose terminal frame was lost is kept. Ported from `codexStream`. New
    pure `anthropicTruncationReason` in `catalog.ts`.
  - **#88** — *Lift the hardcoded 16K output cap* (PR #90 → `5c24299`). Streaming path requests
    `anthropicModelCaps(model).maxOutput` (Opus 128K, Sonnet/Haiku 64K); Inquire keeps the bounded
    `INQUIRE_MAX_TOKENS = 16_000`. `anthropicModelCaps` return type pins `maxOutput` as always-present.
  - Full write-up in [[decisions]] (2026-07-15 "#87/#88 fix landed"). `bun run test` **387** (+11),
    vscode `tsc` clean. Both target 2.0.4.
- **In flight / being cut this session:** **wisp-router 2.0.4** release (bump `packages/tui/package.json`
  → tag `v2.0.4` → `.github/workflows/release.yml`).
- **Blocked:** none.

## Pick up here
1. **Verify the 2.0.4 release:** `gh run list --repo EstarinAzx/Wisp-Router --workflow release.yml`
   → newest `v2.0.4` run green → `npm view wisp-router version` → **2.0.4** → platform probe (Open
   questions) before blaming CI.
2. **Live-confirm #87's residual** (the one thing tests can't reach): run `claude-wisp`, force/observe a
   content-less turn, and check the Bridge `[bridge]` logs. If a failure logs `[bridge] error anthropic …`
   but Claude Code **still** shows "empty or malformed", the mid-stream error frame isn't honored by the
   client → **split a smaller sub-issue off #87** (per the confirm signature in [[decisions]]).
3. **Eyeball the FIXED `/bridge` screen** in a real terminal (the 1830600 fix — never visually verified).
4. Then the backlog: #68 (chat mode) / #69 (copilot-wisp), or the small orphans below.

Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`; VS Code
extension 1.7.0 release (CHANGELOG Unreleased ready); root `.vsix` pile (ask before purging); panel-side
alias rename (TUI-only today); `.claude/settings.local.json` snippet switch (spec #78 out-of-scope note).

## Skills for next session
- /preset pick-up → verify 2.0.4 + the live checks above. /preset catch-up only if this note is stale.

## Open questions
- (new) #87 live confirm: does a real content-less failure log `[bridge] error anthropic …` or not? No
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
- The fix touched `packages/core/src/anthropicClient.ts` (`anthropicStream`, `INQUIRE_MAX_TOKENS`) +
  `catalog.ts` (`anthropicTruncationReason`, `anthropicModelCaps` return type); reference guard is
  `codexClient.ts` `codexStream`; door path `bridgeServer.ts` `handleAnthropicMessages`
  (`anthropicErrorFrame` at ~L499); encoder `bridgeAnthropic.ts` `finish()`. Tests in
  `packages/core/tests/anthropic.test.ts` (`anthropicStream (streaming IO)` block + `anthropicTruncationReason`).
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).
- Repo labels: `ready-for-agent` (frontier), `ready-for-human`. Ticket-loop is label-gated — the queue is
  now empty (#87 + #88 both closed).

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
