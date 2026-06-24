---
type: pick-up
project: wisp
updated: 2026-06-24
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What just finished (this session, branch `feat/bridge`, committed local — not pushed)
- **#40 — Anthropic over the Bridge.** `handleAnthropicChat` (Messages SSE, `anthropicAuth` creds, raw effort,
  `toAnthropicTools`). Live-verified: `model:'anthropic'` → `finish_reason=stop`.
- **(b) — Copilot CLI shows the real model name.** `COPILOT_MODEL` = resolved model name; `handleChat` routes a
  non-id model → the **active Provider** (`activeProviderId`). Verified end-to-end with the real `@github/copilot`
  binary (`data.model:"minimax-m3"`).
- The **Bridge is feature-complete** — keyed + codex + anthropic all reachable; Copilot-CLI happy path proven.
- `tsc` clean, 234 tests green, full compile clean.

## Next task → **Ship + release**
1. `/preset ship` — push `feat/bridge`, open the PR (commit is local only). PR body covers #40 + (b).
2. **Release the Bridge** (closes PRD **#34**, the only other open issue): bump version (1.3.0 → ~1.4.0),
   update `CHANGELOG.md` + `README.md` (Bridge + Copilot-CLI BYOK setup), package the vsix.
3. **Optional follow-up** (small, same `injectCopilotEnv` touch point): inject
   `COPILOT_PROVIDER_MAX_PROMPT_TOKENS` / `COPILOT_PROVIDER_MAX_OUTPUT_TOKENS` from real model caps to kill
   Copilot's `not in the built-in catalog` token-window warning.

## Landmines
- **Provider switch needs a NEW terminal; model/effort are live.** Copilot label = launch snapshot; model used is
  live. Running terminals now follow the **active** Provider (loose routing fallback). See [[gotchas]].
- **Standalone GUI Copilot app does NOT use the Bridge** — terminal env only. Use `copilot` in a new terminal.
- **PowerShell:** `Invoke-RestMethod`, not `curl.exe`; `message=;` is display collapse — read
  `.choices[0].message.content`.
- **Anthropic streaming + tool-calls not explicitly live-run** (only non-stream text). Low risk; confirm if paranoid.
- `.context/flows.md` is untracked and **not mine** — left out of this commit.

## Related
- [[active-work]] · [[api]] · [[decisions]] · [[gotchas]]
