---
type: active-work
project: wisp
updated: 2026-07-06
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-06 by Opus 4.8._
_On `main` at `3df4d52` (v1.4.3). DeepSeek agent-mode tool-schema 400 fixed, released, user-confirmed working._

## Current focus
**DeepSeek (opencode-go / deepseek-v4-pro) agent mode 400'd every turn — FIXED (v1.4.3).**
Real upstream error (the opencode gateway masks it as a doubled "Console Go: Upstream request failed"):
`Invalid schema for function 'terminal_last_command': schema must be a JSON Schema of 'type: "object"', got 'type: null'`.

Root cause: VS Code no-arg agent tools arrive with no `inputSchema`; `toOpenAiTools` defaulted that to bare
`{}` — a schema with no `type`. Lenient backends (kimi-k2.7, OpenAI, the user's other opengo harnesses)
accept it; **DeepSeek is strict** and rejects it. Same empty-schema tool never broke Codex/Anthropic because
those two tool builders already defaulted to `{ type:'object', properties:{} }` — `toOpenAiTools` was the
lone hole.

## State
- **Done this session (direct to `main`):**
  - **`toOpenAiTools` (`src/catalog.ts`)** now defaults a missing schema to `{ type:'object', properties:{} }`,
    mirroring `toCodexResponsesTools` / `toAnthropicTools`. One-line fix, inline-commented.
  - **`src/catalog.test.ts`** — the test that encoded the old `{}` behavior is flipped to assert the object schema.
  - **v1.4.2 → 1.4.3** (`package.json`). `tsc`/compile clean, **244 tests green**, `wisp-1.4.3.vsix` built.
  - **Released:** GitHub release `v1.4.3` created with the vsix attached.
- **In flight:** nothing.
- **Blocked:** nothing. **User-confirmed working** — deepseek-v4-pro agent mode ("who are you") replies clean, eyeballed 2026-07-06.

## Prior session (2026-07-06, v1.4.2)
Codex streaming cutoff fixed (`f552995`, PR #42) — bad stream endings surfaced (empty drop → throw; partial →
soft marker; `response.incomplete` → visible truncation). Write-up: `CODEX-STREAM-CUTOFF-FINDINGS.md`. Still
built-but-unreleased as of that session; superseded here by v1.4.3.

## Pick up here
Nothing forced. Optional follow-ups, rough priority:
1. **Agent-mode vision intermittency — still OPEN** (from the v1.4.1 session, unrelated to this fix). See Open questions.
2. **Bridge image follow-up.** `handleAnthropicChat` in `src/bridgeServer.ts` still drops images — thread them
   through the Bridge's message mapping now that `buildAnthropicMessagesBody` accepts `images`. Low priority.
3. **Copilot CLI catalog warning** (`injectCopilotEnv`): inject `COPILOT_PROVIDER_MAX_PROMPT_TOKENS` /
   `_MAX_OUTPUT_TOKENS` from real caps to kill the `not in the built-in catalog` warning. Cosmetic.

## Skills for next session
- /preset pick-up — resume from this note.
- /preset ship — only if you want a PR; this fix already landed on `main`.

## Open questions
- **Agent-mode vision is intermittent — root cause NOT pinned (OPEN).** Plain/Ask mode reads images reliably;
  agent mode sometimes answers "attachment empty" (same image/model/build, confirmed both success AND failure
  in agent mode). To resolve: re-add the probe (incoming `images=` count + last-turn part kinds + `OUT` body
  shape in `chatProvider.ts` `provideLanguageModelChatResponse`), F5, reproduce a FAILURE, read the pair.
  `images=0` → VS Code dropped it (host). `images≥1` + no `image(...)` in `OUT` → our builder dropped it (our bug).
  `images≥1` + `OUT` shows `image(…b64)` → sent correct, model ignored it.

## Recent context
- **Strict vs lenient tool-schema backends:** DeepSeek (via opencode-go) enforces `type:"object"` on every
  function's `parameters`; kimi/OpenAI don't. The three tool builders in `catalog.ts` must all default a
  missing schema to `{ type:'object', properties:{} }` — now they do.
- **opencode gateway masks upstream errors** as a doubled "400 Error from provider (Console Go): Upstream
  request failed". To see the real reason, hit `https://opencode.ai/zen/go/v1/chat/completions` directly
  (repro pattern: no-tools vs minimal-tool vs vscode-style-tool).

## Related
- [[overview]]
- [[happy-path]] — the Bridge golden-path MVD
- [[api]] — Bridge endpoints, `COPILOT_*` env, `wisp.bridge.secret` slot
- [[decisions]] — Bridge + side-panel forks
- [[gotchas]] — PowerShell curl trap, F5 dup trap, new-terminal env trap, GUI-app-no-Bridge trap
