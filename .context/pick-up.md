---
type: pick-up
project: wisp
updated: 2026-07-06
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**DeepSeek agent-mode 400 — FIXED, released, user-confirmed working (v1.4.3, `main` @ `3df4d52`).**
Agent mode on `opencode-go / deepseek-v4-pro` 400'd every turn. The opencode gateway masked the reason as a
doubled "Console Go: Upstream request failed"; the real error was `Invalid schema for function
'terminal_last_command': schema must be a JSON Schema of 'type: "object"', got 'type: null'`. VS Code no-arg
tools arrive with no `inputSchema`; `toOpenAiTools` defaulted that to bare `{}` (no `type`). DeepSeek is strict
and rejects it; kimi/OpenAI/other opengo harnesses are lenient and accept it. Fix: default to
`{ type:'object', properties:{} }`, matching the Codex/Anthropic tool builders. 244 tests green, compile clean,
`wisp-1.4.3.vsix` built, GitHub release `v1.4.3` created with the vsix.
Files: `src/catalog.ts` (`toOpenAiTools`), `src/catalog.test.ts`, `package.json`.

## Nothing forced next. Optional follow-ups
- **Agent-mode vision intermittency — still OPEN** (from the v1.4.1 session, unrelated). Repro-a-failure plan
  is in `active-work.md` Open questions (re-add the `images=`/`OUT` probe, F5, catch an "empty" turn).
- **Bridge image follow-up** — `handleAnthropicChat` in `src/bridgeServer.ts` still drops images. Low priority.
- **Copilot CLI catalog warning** — inject `COPILOT_PROVIDER_MAX_*` from real caps. Cosmetic.

## Landmines
- **All three tool builders in `catalog.ts` must default a missing schema to `{ type:'object', properties:{} }`.**
  DeepSeek (via opencode-go) 400s on a typeless schema; kimi/OpenAI silently tolerate `{}`, which is how this
  hid so long. Don't reintroduce a bare `{}` default.
- **opencode gateway hides upstream errors** (doubled "Console Go: Upstream request failed"). To see the real
  400, POST `https://opencode.ai/zen/go/v1/chat/completions` directly (repro pattern: no-tools / minimal-tool /
  vscode-style-tool). Key from `https://opencode.ai/auth`.
- **Never send `max_output_tokens` for Codex** (gpt-5.x rejects it, 400). Guarded by a comment in `catalog.ts`.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap serves a stale panel).
- `.context/overview.md` has a pre-existing uncommitted diff (not from this session); `.context/flows.md` is
  untracked and not mine — leave both out of commits.

## Related
- [[active-work]] · [[overview]] · [[gotchas]]
