---
type: active-work
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-10 by Opus 4.8 (background)_
_At commit: 11c907c + uncommitted model-id fix (3 files, not yet committed)_

## Current focus
Model picker + completion output fixed end-to-end. Bugs found and fixed this session:
1. Dropdown only showed the configured model — the live `/models` list was never auto-fetched (only on a manual ↻ the user never found).
2. Completions failed the whole time with `401 Model opencode/minimax-m3 is not supported` — the `zen/go/v1` chat endpoint **rejects the provider-prefixed id**; wants the **bare** `minimax-m3`.
3. Ghost text was the model's raw `<think>…</think>` reasoning — the served ids are reasoning models. Added `stripThink`.
4. The `maxTokens: 64` cap starved completions (reasoning eats the budget; multi-line truncated) → default now `0` = uncapped.

Recompiled, repackaged, and `--force`-reinstalled the `.vsix` after each fix. **Verified working** post-reload — clean multi-line completions, no `<think>`, no 401 (confirmed via the latency log: `minimax-m3 7459ms 597c` etc., zero `[error]` lines). Committed on `feat/side-panel`.

## State
- **In flight:** uncommitted edits in `package.json`, `src/extension.ts`, `webview/app.tsx`. Not yet committed.
- **Done this session:**
  - `webview/app.tsx` — auto-fetch the model list on first state / key-set / endpoint-change (gated on origin change so it can't loop on an empty result or re-fire on unrelated config pushes).
  - `src/extension.ts` — `DEFAULT_MODEL` → bare `minimax-m3` (was `opencode/minimax-m3`); `fetchModelIds` now returns ids exactly as `/models` serves them (bare, no prefix — the earlier prefixing experiment was reverted as it was the wrong direction).
  - `src/extension.ts` — `stripThink` cleanup step (drops inline `<think>…</think>`; unterminated `<think>` → insert nothing), wired before `stripFences`/`stripPrefixOverlap`. Made `max_tokens` opt-in: sent only when the setting is `>0`.
  - `package.json` — `opencodeAutocomplete.model` default → `minimax-m3`; `maxTokens` default → `0` (uncapped) + description notes.
  - Diagnosed the 401 by reading the persisted output-channel log on disk (see [[gotchas]]) rather than via the Output panel.
  - Confirmed `GET https://opencode.ai/zen/go/v1/models` is **public** (no auth) and serves 18 bare ids: `minimax-m3` / `m2.7` / `m2.5`, `kimi-k2.6` / `k2.5`, `glm-5.1` / `5`, `deepseek-v4-pro` / `flash`, `qwen3.7-max` / `plus`, `qwen3.6` / `3.5-plus`, `mimo-v2-pro` / `omni`, `mimo-v2.5-pro` / `2.5`, `hy3-preview`.
  - Recompiled (clean), repackaged `opencode-autocomplete-0.0.1.vsix`, reinstalled with `--force`.
- **Blocked:** nothing.

## Pick up here
1. **Faster default model** — `minimax-m3` works but is a reasoning model: 4–7.6s/suggestion (too slow for live typing). Try `deepseek-v4-flash` / `kimi-k2.6` via the panel; if a non-reasoning id is reliably sub-second, change `DEFAULT_MODEL` + the `model` setting default.
2. **TDD M1 + M2** — still unwritten (pure fns in `src/extension.ts`: `stripFences`/`stripPrefixOverlap`, `buildContext`, and now `stripThink`). Not exported yet. Use `/tdd`.
3. **(optional) `/preset ship`** — push `feat/side-panel`, open a PR.

## Open questions
- None blocking. (`stripThink` is regex-based on `<think>` tags — if a model uses a different reasoning delimiter or a separate `reasoning_content` field, it won't be caught; revisit only if a switched model leaks reasoning.)

## Related
- [[overview]]
- [[api]]
- [[decisions]]
- [[gotchas]]
