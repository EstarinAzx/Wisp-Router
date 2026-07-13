---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 by Fable 5._
_On `main` at `5bb9da7` (pushed). Gate slice #44 done + closed; no release._

## Current focus
**Bridge Anthropic door — route Claude Code through Wisp providers. PRD #43; gate #44 CLOSED, translator #45 unblocked.**
The Bridge grows a second front door speaking Anthropic's Messages protocol so Claude Code (pointed at it
via `ANTHROPIC_BASE_URL` + Bridge secret) sees Wisp providers in its own `/model` picker and runs coding
tasks through any of them — headline: Claude Code on the ChatGPT-subscription Codex provider.

## State
- **Done this session (slice #44 — the gate, commit `5bb9da7`):**
  - Canned Anthropic door mounted on the Bridge: `GET /v1/models` (Anthropic shape, hardcoded mixed ids) +
    `POST /v1/messages` (wire-fact logging + canned SSE turn), flavored off `anthropic-version`/`x-api-key`
    headers. **Throwaway until #45/#46** — except the auth widening (`x-api-key` OR Bearer), which is permanent.
  - Wire facts captured from REAL Claude Code sessions (print mode both auth variants + user's interactive
    picker session) — full record in **issue #44's two comments** (the contract for #45):
    picker filters plain ids (verdict → `claude-wisp-*` aliases + inbound strip); `system` is a block ARRAY
    (billing-marker block first); `role:"system"` turns appear INSIDE `messages`; background tier sends stock
    `claude-haiku-4-5-20251001` with FORCED `tool_choice` + `temperature:0`; model strings arrive verbatim,
    no client-side validation; beta header varies per call — treat opaque.
  - **#44 closed** (all three acceptance criteria answered). 244 tests green.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
1. **Slice #45 — pure translator pair + Vitest** (now unblocked): inbound Anthropic Messages request →
   normalized Wisp turns (flatten `system` array, handle mid-messages system role, map forced `tool_choice`
   + `temperature`, ignore `thinking`/`context_management`/`output_config`/`metadata`/`cache_control`);
   outbound Wisp stream → Anthropic SSE (message_start → content_block deltas incl. `input_json_delta` →
   message_delta/stop). Beside `bridge.ts`, tests beside `bridge.test.ts`. `/preset scope 45`.
2. Then #46 (wire live, strip `claude-wisp-` inbound, Codex demo) → #47 (panel snippet section).
3. Older optional follow-ups (unchanged): agent-mode vision flake (see Open questions), `handleAnthropicChat`
   outbound image drop, Copilot catalog-warning env vars.

## Skills for next session
- /preset pick-up — resume from the note.
- /preset scope 45 — enter the work loop on the translator slice.

## Open questions
- **Agent-mode vision is intermittent — root cause NOT pinned (OPEN, pre-existing).** Plain/Ask mode reads
  images reliably; agent mode sometimes answers "attachment empty". To resolve: re-add the probe (incoming
  `images=` count + last-turn part kinds + `OUT` body shape in `chatProvider.ts`
  `provideLanguageModelChatResponse`), F5, reproduce a FAILURE, read the pair.

## Recent context
- **Gate harness trick (reusable):** `createBridgeServer`'s import chain is vscode-free — a stub-deps
  node script can run the listener standalone, and a nested `claude -p` with `ANTHROPIC_*` env pointed at it
  captures real wire traffic without F5. Harness lived in session scratchpad; ~10 lines to recreate.
- **Active-Provider fallback already live on the Bridge** (verified vs real Copilot binary): unknown model
  names serve the active Provider instead of 404 — this is what absorbs Claude Code's hardcoded background-tier
  haiku id. No new routing machinery in #46.
- Claude Code gateway contract, now EMPIRICAL (issue #44 comments supersede the docs-derived notes):
  `x-api-key` ← `ANTHROPIC_API_KEY`, `Bearer` ← `ANTHROPIC_AUTH_TOKEN`, `anthropic-version` on every call
  (GET included — the dialect-flavoring signal), discovery `GET /v1/models?limit=1000` needs
  `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, picker renders `display_name`, env read at startup only.

## Related
- [[overview]]
- [[happy-path]] — both Bridge golden paths (Copilot door + Anthropic door)
- [[api]] — Bridge endpoints incl. the #44 gate routes + widened auth
- [[decisions]] — 2026-07-13 Anthropic-door entry + gate verdict
- [[gotchas]] — PowerShell curl trap, F5 dup trap, new-terminal env trap, GUI-app-no-Bridge trap
