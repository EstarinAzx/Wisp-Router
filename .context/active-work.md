---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 by Opus 4.8._
_On branch `feat/anthropic-door` at `b9f7610` (NOT pushed). Slices #45 + #46 done + demo-verified; #47 next._

## Current focus
**Bridge Anthropic door — route Claude Code through Wisp providers. PRD #43.**
The Bridge speaks Anthropic's Messages protocol so real Claude Code (pointed at it via `ANTHROPIC_BASE_URL` +
Bridge secret) sees Wisp providers in its own `/model` picker and runs coding tasks through any of them. As of
this session the door is **live and proven end-to-end** against real Claude Code.

## State
- **Done this session (branch `feat/anthropic-door`):**
  - **Slice #45 (`5089a32`) — pure translator pair.** New `bridgeAnthropic.ts` + `bridgeAnthropic.test.ts`:
    `parseAnthropicMessagesRequest` (Messages → `BridgeChatRequest` + `toolChoice` + `temperature`),
    `createAnthropicSseEncoder`/`buildAnthropicSse` (Wisp stream → Anthropic SSE), `buildAnthropicModelsList`
    (`claude-wisp-<id>` aliases). Pure, vscode-free.
  - **Slice #46 (`44f3091`) — wired live.** `bridgeServer.ts`: replaced the #44 canned handlers with real
    routing (`handleAnthropicMessages`/`handleAnthropicModels` + `startProviderStream` for all 3 Provider
    kinds). Additive — the OpenAI door's send paths untouched. Gate `[gate]` logging deleted.
  - **Two demo fixes** surfaced by real Claude Code:
    - `7cb3fb8` — door now writes an Anthropic **`error` SSE event** on a mid-stream failure (was truncating →
      "empty/malformed HTTP 200"); + strip Codex-rejected schema keywords (strict-path hardening).
    - `b9f7610` — **door forwards Codex tools `strict:false`** (the real fix — external toolsets can't be
      strict-coerced; see [[decisions]] 2026-07-13). `toCodexResponsesTools` gained a `strict` flag.
  - **Live demo PASSED** vs real Claude Code (all #46 criteria): `/model` lists Wisp rows ("From gateway") and
    routes; Codex OAuth (`gpt-5.6-sol`) **and** keyed OpenCode Go (`kimi-k2.7-code`) both stream replies;
    tool round-trip proven (agent wrote `hello.txt`); no `[bridge] error` on the background haiku call.
  - **273 unit tests green, tsc clean, `out/` rebuilt.**
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
1. **Slice #47 — side-panel Claude Code setup section.** A copy-paste env snippet in the Bridge panel so
   users don't hand-type the block: `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`, `ANTHROPIC_API_KEY=<secret>`,
   `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`. Banned: the global `~/.claude/settings.json` env block
   (hijacks every session) — per-session shell line or project `.claude/settings.json` only. Issue #47.
2. **Then: PR the branch to `main`** — #45–#47 all ride `feat/anthropic-door`; one PR closes #45/#46/#47.
   (#45 + #46 stay OPEN on GitHub until that merge, though both are functionally done + verified.)
3. Older optional follow-ups (unchanged): agent-mode vision flake (Open questions), `handleAnthropicChat`
   outbound image drop, Copilot catalog-warning env vars, and the OpenAI-door Codex path's strict-tool limit
   (same as #46's fix, deferred — Copilot's tools may be simpler).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset scope 47 — enter the work loop on the panel-snippet slice.

## Open questions
- **Deferred by design (not bugs):** Claude Code's `/effort` and forced `tool_choice` + `temperature` are
  carried but NOT threaded to the backend — the door uses **Wisp's** panel effort and `tool_choice:'auto'`.
  Revisit only if wanted (thread `output_config.effort` / forced choice through). See `ponytail:` notes in
  `bridgeServer.ts`.
- **Agent-mode vision intermittent — root cause NOT pinned (OPEN, pre-existing).** Plain/Ask mode reads images
  reliably; agent mode sometimes answers "attachment empty". To resolve: re-add the probe in `chatProvider.ts`
  `provideLanguageModelChatResponse`, F5, reproduce a FAILURE, read the pair.

## Recent context
- **`Ctrl+R` runs the stale build** — recompile (`npm run compile`) before reloading the Extension Dev Host, or
  full stop→F5. Cost two demo rounds this session. See [[gotchas]].
- **Model routing:** the door sends **Wisp's** configured Provider model (`resolveModel`), NOT Claude Code's
  picked id — the inbound `model` only routes (named id → Provider, unknown/raw `claude-*` → Active Provider).
- Claude Code gateway contract (empirical, issue #44 comments): `x-api-key`←`ANTHROPIC_API_KEY`,
  `Bearer`←`ANTHROPIC_AUTH_TOKEN`, `anthropic-version` on every call (the dialect-flavoring signal), discovery
  needs `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, env read at startup only.

## Related
- [[overview]]
- [[happy-path]] — both Bridge golden paths (Copilot door + Anthropic door)
- [[api]] — Bridge endpoints incl. the LIVE Anthropic door (#45/#46)
- [[decisions]] — 2026-07-13 non-strict Codex door tools + gate verdict
- [[gotchas]] — stale-build trap, non-strict door tools, PowerShell curl trap, F5 dup trap
