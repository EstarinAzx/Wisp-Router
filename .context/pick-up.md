---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Diagnosis only — no code diff.** Ran down the intermittent `claude-wisp` error *"API returned an
empty or malformed response (HTTP 200) — check for a proxy or gateway intercepting the request."*
Root cause is **our end**: `claude-wisp` points Claude Code's `ANTHROPIC_BASE_URL` at the Bridge, so
the Bridge IS the "gateway"; the Anthropic door forwards a **content-less** upstream turn
(thinking-only / `max_tokens`-truncated / idle-dropped-with-no-error-frame) as a structurally-valid
but **empty** SSE envelope, which Claude Code rejects. The **Codex** path was already hardened against
this; the Anthropic path never got the guard. Amplifier: hardcoded 16K `ANTHROPIC_MAX_TOKENS`. Full
write-up in [[decisions]] (2026-07-15). Filed **#87** (the guard — `ready-for-agent`, frontier) and
**#88** (lift the 16K cap — blocked by #87, deliberately no label). Target wisp-router 2.0.4.

## Next task
**Loop the fix — `/loop /preset ticket-loop`** (or `/relay 30m N=8 /preset ticket-loop` for a long run).
1. It grabs **#87** (only frontier ticket): port `codexStream`'s empty/truncation guard to
   `anthropicStream` (`packages/core/src/anthropicClient.ts`), surface a diagnostic instead of an empty
   envelope, tests in `packages/core/tests/anthropic.test.ts`.
2. When #87's PR merges, **promote #88**:
   `gh issue edit 88 --repo EstarinAzx/Wisp-Router --add-label ready-for-agent`.

**Also still pending (carried, NOT superseded): verify release 2.0.3.**
- `gh run view 29383784428` → expect green.
- `npm view wisp-router version` → 2.0.3; platform probe if suspicious (landmines).
- Real terminal: eyeball the FIXED `/bridge` screen (1830600) — never visually verified.

## Landmines
- #87 confirm FIRST via the Bridge `[bridge]` logs: NO `[bridge] error` line + request ended =
  empty-envelope path (the target). `[bridge] error anthropic …` present but Claude Code still
  "empty/malformed" = the mid-stream error frame isn't honored → split a smaller sub-issue off #87.
- Ticket-loop is **label-gated**; a blocked ticket must not carry `ready-for-agent` (why #88 is bare).
  Don't let the loop grab #88 before #87 lands.
- npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI.
- User should still rotate the npm token (repo secret `NPM_TOKEN`).
- Codex signed out on this machine — `/signin codex` before Codex live checks.
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes
  real `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- PowerShell 5.1 mangles multi-line `git commit -m` — use `git commit -F <file>` (or Bash heredoc).
- Tests are 376; `bun run test` at root.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
