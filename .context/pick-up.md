---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Shipped the empty/malformed-200 fix and cut wisp-router 2.0.4.**
- **#87** (PR #89 → `2008cd8`): `anthropicStream` now guards content-less turns — throws on a truly-empty
  turn (thinking-only / dropped) so the Anthropic door writes a real `anthropicErrorFrame`/502 instead of
  the silent empty SSE envelope Claude Code rejected; surfaces the truncation reason
  (`max_tokens`/`content_filter`/`refusal`) as a visible marker; keeps partial content on a lost terminal
  frame. Ported from `codexStream`. New pure `anthropicTruncationReason` in `catalog.ts`.
- **#88** (PR #90 → `5c24299`): streaming path requests the model output ceiling
  (`anthropicModelCaps(model).maxOutput` — Opus 128K, Sonnet/Haiku 64K) instead of the hard 16K; Inquire
  keeps the bounded `INQUIRE_MAX_TOKENS`.
- `bun run test` **387** (+11), vscode `tsc` clean. Both closed. Full write-up in [[decisions]] (2026-07-15
  "#87/#88 fix landed"). Release **2.0.4** cut this session (tag `v2.0.4`).

## Next task
**Verify the 2.0.4 release, then two live checks tests can't reach.**
1. `gh run list --repo EstarinAzx/Wisp-Router --workflow release.yml` → newest `v2.0.4` run **green** →
   `npm view wisp-router version` → **2.0.4**. Platform probe if suspicious (see Landmines).
2. **Live-confirm #87's residual:** run `claude-wisp`, hit/observe a content-less turn, grep the Bridge
   `[bridge]` logs. NO `[bridge] error` line + request ended = the empty-envelope path the guard now
   throws on (fixed). `[bridge] error anthropic …` present but Claude Code **still** "empty/malformed" =
   the mid-stream error frame isn't honored by the client → **split a smaller sub-issue off #87**.
3. Eyeball the FIXED `/bridge` screen (1830600) in a real terminal — never visually verified.

## Landmines
- The ticket-loop queue is now **empty** (#87 + #88 both closed) — a `/loop /preset ticket-loop` will just
  report "queue empty" until new `ready-for-agent` tickets are filed.
- npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI. A burned version can never be republished.
- User should still rotate the npm token (repo secret `NPM_TOKEN`).
- Codex signed out on this machine — `/signin codex` before Codex live checks.
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes real
  `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- PowerShell 5.1 mangles multi-line `git commit -m` — use `git commit -F <file>` (or Bash heredoc).
- Tests are 387; `bun run test` at root.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
