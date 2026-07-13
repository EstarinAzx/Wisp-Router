---
type: pick-up
project: wisp
updated: 2026-07-13
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Slices #45 + #46 DONE and demo-verified — the Anthropic door is LIVE.** On branch `feat/anthropic-door`
(4 commits, `5089a32`→`b9f7610`, NOT pushed). #45 = pure translator (`bridgeAnthropic.ts` + tests). #46 =
wired it into `bridgeServer.ts` (real routing, replaced the #44 canned door, additive to the OpenAI door).
Plus two fixes real Claude Code forced: an Anthropic **`error` SSE event** on mid-stream failure, and the big
one — **Codex tools forwarded `strict:false`** (external toolsets can't be strict-coerced; `AskUserQuestion`'s
dynamic map 400s under strict). **Live demo passed all #46 criteria:** `/model` lists + routes Wisp providers;
Codex OAuth and keyed OpenCode Go both stream + do a tool round-trip (agent wrote `hello.txt`). 273 tests green.

## Next task
**Slice #47 — side-panel Claude Code setup section (issue #47).** Add a copy-paste env snippet to the Bridge
panel so users don't hand-type it: `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`, `ANTHROPIC_API_KEY=<secret>`,
`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`. It's the last slice on this branch. Enter with `/preset scope 47`.
**After #47: open ONE PR** `feat/anthropic-door` → `main` (closes #45/#46/#47 — all three are still OPEN on
GitHub, they close on merge).

## Landmines
- **`Ctrl+R` in the Extension Dev Host runs the STALE build.** After any source edit, `npm run compile` (I can
  run it) THEN `Ctrl+R`, or full stop→F5. A bare `Ctrl+R` silently tests old code — it cost two demo rounds.
- **NEVER suggest the global `~/.claude/settings.json` env block** for the #47 snippet (hijacks every Claude
  Code session) — per-session shell line or project `.claude/settings.json` only. Banned in PRD #43.
- **PowerShell is the user's default shell** — env is `$env:NAME = "..."`, not bash `export`. `claude` reads
  env at startup only → fresh terminal after any change.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- **Effort:** the door uses **Wisp's** panel effort, not Claude Code's `/effort` (`output_config` ignored). To
  run xhigh, set it in the Wisp panel. This is by design — not a bug to "fix" unasked.
- **The keyed door path already tolerated Claude Code's tool schemas** (non-strict); only Codex needed the fix.

## Related
- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[gotchas]] · [[happy-path]]
