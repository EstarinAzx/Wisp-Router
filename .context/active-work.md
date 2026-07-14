---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: 86007b7 on `main` (PR #76 merged), pushed._

## Current focus
**TUI slice 7 landed.** #64 — **`claude-wisp`** shipped as PR
[#76](https://github.com/EstarinAzx/Wisp-Router/pull/76): the launcher bin that starts Claude Code
pre-wired to the Bridge. It reads port + secret from `~/.wisp` (read-only — a missing secret means
no Bridge ever ran), probes the Bridge (down → friendly "start `wisp serve`" message, exit 1, never
auto-starts), spawns `claude` with the env trio on the **child only** (`ANTHROPIC_BASE_URL`,
`ANTHROPIC_API_KEY`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`), passes argv through verbatim,
and mirrors the child's exit code. All seven acceptance criteria live-verified on Windows, including
a real round-trip: `claude-wisp --model haiku -p …` → Bridge routed `haiku → opencode-go` → `pong`.

## State
- **Done this session (#64, PR #76, main @ 86007b7):**
  - core: `buildClaudeLaunch(port, secret, argv)` — the pure launch contract ({env trio, argv copy})
    in `bridgeAnthropic.ts` next to `buildClaudeCodeSnippets` (same env trio). Suite **356/356**.
  - tui: new `src/claude-wisp.ts` bin + `claude-wisp` declared in package.json (the install-linking
    trap this slice was gated on). Windows resolution: `claude.exe` scanned on PATH first (direct,
    fully verbatim spawn); npm `.cmd`/`.bat` shim falls back to `cmd.exe /d /s /c` with hand quoting
    (node/Bun refuse `.cmd` without a shell — BatBadBut).
  - Review (cavecrew) found + fixed pre-merge: probe no longer sends the secret (a port squatter
    must never see it; any HTTP response — even 401 — proves the listener), `quoteForCmd` triggers
    on cmd metachars (`& | < > ^`), trailing backslashes doubled before the closing quote.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**#67 — Release: CI binary matrix + npm `wisp-router` publish** (`ready-for-agent`, now unblocked —
its only blocker was #64). The critical-path finale: `bun build --compile` per-platform binaries +
npm thin-shell publish exposing bins `wisp` + `claude-wisp` (ADR-0003). Suggested: `/preset scope 67`.
**#65 (/routing UI)** is the parallel alternative. Backlog: #68 (chat mode), #69 (copilot-wisp).

## Skills for next session
- /preset scope — entry gate for #67 (or #65).

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- Bridge client tag: the `claude-wisp --model haiku` run logged `messages opencode-go … (panel)`
  while the default-model run logged `(claude code)` — the client-detection heuristic mislabels
  some Claude Code requests. Cosmetic (log line only); worth a glance in a Bridge slice.
- `/test` border-title fix (`f2efe18`) still compile-verified only — eyeball during the next TUI run.
- Codex is currently **signed out** on this machine (tombstone from #61 testing) — sign in before
  any Codex-path live checks. This is why the #64 verification routed via `--model haiku`
  (haiku family → keyed `opencode-go`) instead of the active provider (codex).

## Recent context
- Ticket shape: #58✅→#59✅→#60✅→#61✅→#62✅→#63✅→#64✅; open: #67 (unblocked, critical path),
  #65 (parallel); backlog #68/#69.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; set `WISP_HOME` to sandbox).
  Headless: `bun src/index.tsx serve`. Launcher: `bun src/claude-wisp.ts [args…]`.
- Both faces share the Bridge port + secret — testing serve while VS Code hosts the Bridge hits the
  (intended) loud port collision; stop one first.

## Related
- [[overview]] — claude-wisp bin now real; run line added
- [[stack]] — test count bumped
- [[decisions]] — 2026-07-14 launcher execution details entry
- [[gotchas]]
- [[pick-up]]
