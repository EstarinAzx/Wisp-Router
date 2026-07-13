---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Slice #44 (Anthropic-door gate) — DONE and CLOSED.** Canned door mounted on the Bridge (commit `5bb9da7`,
pushed), real Claude Code driven against it (print mode + user's interactive picker session), all three
acceptance criteria answered. **Full wire-fact record lives in issue #44's two comments — that is the
contract slice #45 builds against.** Headlines: picker filters plain ids → locked decision `claude-wisp-*`
aliases + inbound strip; `system` arrives as a block ARRAY; `role:"system"` turns appear inside `messages`;
background tier sends stock `claude-haiku-4-5-20251001` with forced `tool_choice` + `temperature:0`.
Bridge auth permanently widened (`x-api-key` OR Bearer). 244 tests green.

## Next task
**Slice #45 — the pure translator pair + Vitest.** Inbound: Anthropic Messages request → normalized Wisp
turns (flatten system array, mid-messages system role, map forced `tool_choice` + `temperature`, ignore
`thinking`/`context_management`/`output_config`/`metadata`/`cache_control`). Outbound: Wisp stream →
Anthropic SSE (message_start → content_block deltas incl. `input_json_delta` tool streaming → message_delta
with stop reason → message_stop). Pure module beside `src/bridge.ts`, tests beside `bridge.test.ts`, external
behavior only. Read issue #44's comments first. Enter with `/preset scope 45`.

## Landmines
- **The gate routes in `bridgeServer.ts` are THROWAWAY** — #45/#46 replace them; only the widened `authOk`
  stays. Don't build on the canned handlers.
- **Background tier hits the door with a real haiku id** — never 404 unknown `claude-*`; the live
  Active-Provider fallback absorbs it (reuse, don't rebuild).
- **Forced `tool_choice` must round-trip** — background calls use `{"type":"tool","name":…}`; the OpenAI-door
  path hardcodes `'auto'`, translator can't.
- **Never suggest the global `~/.claude/settings.json` env block** (hijacks every session) — per-session
  shell line or project `.claude/settings.json` only (banned in PRD #43 / slice #47).
- **Claude Code reads env at startup only** — fresh terminal after any env change.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Gate harness trick if wire capture is needed again: stub-deps node script over `createBridgeServer`
  (vscode-free chain) + nested `claude -p` with `ANTHROPIC_*` env — no F5 needed.

## Related
- [[active-work]] · [[overview]] · [[happy-path]] · [[decisions]] · [[api]]
