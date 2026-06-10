---
type: pick-up
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-10):** fixed the model picker + completion output end-to-end. Four bugs, all fixed, verified working, and committed on `feat/side-panel`:
1. Dropdown only showed the configured model → `webview/app.tsx` now **auto-fetches** `/models` once a key is set.
2. `401 Model opencode/minimax-m3 is not supported` → the `zen/go/v1` chat endpoint wants the **bare** id; `DEFAULT_MODEL` + `model` default + `fetchModelIds` now bare (`minimax-m3`).
3. Ghost text was raw `<think>…</think>` reasoning → added `stripThink` (served ids are reasoning models).
4. `maxTokens: 64` truncated/starved output → default now `0` = uncapped (`max_tokens` sent only when `>0`).
Confirmed via the latency log (`minimax-m3 7459ms 597c`, zero `[error]`).

**Next task (pick one):**
1. **Faster default model** (highest value) — `minimax-m3` is a reasoning model: 4–7.6s/suggestion, too slow for live typing. Try `deepseek-v4-flash` / `kimi-k2.6` in the panel; if a non-reasoning id is reliably sub-second, change `DEFAULT_MODEL` (`src/extension.ts`) + the `model` default (`package.json`).
2. **TDD M1 + M2** — unit-test the pure fns in `src/extension.ts`: `stripFences` / `stripPrefixOverlap` / now `stripThink` (M1), `buildContext` (M2). Spec in `PRD.md`. Not exported yet → test-export or extract first. Use `/tdd`.
3. **(optional) `/preset ship`** — push `feat/side-panel`, open a PR.

**Landmines (see [[gotchas]]):**
- Model ids are **bare** on `zen/go/v1` — the `opencode/` prefix is rejected (401). Keep `DEFAULT_MODEL` / `fetchModelIds` bare.
- Served models are **reasoning models** — keep `stripThink` and keep `maxTokens` default `0`; a cap starves the answer.
- After editing, the running build is stale until **rebuild + reload window** (recompile + repackage + `--force` install, or F5). User repeatedly tested the old build this session.
- Config writes use `targetFor()` (scope-aware) — don't revert to blind `ConfigurationTarget.Global`.
- `baseUrl` is `"scope":"machine"` (blocks workspace key-redirect) — don't loosen.
- Key never crosses to the webview, incl. error text (`sanitizeError`).
- Two tsconfigs; `compile` must keep `tsc -p webview` (Vite doesn't type-check).

Full rolling state in [[active-work]]; settled choices in [[decisions]].
