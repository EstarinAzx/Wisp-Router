---
type: decisions
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, decisions]
---

<!-- newest entries are at the bottom; see "Side-panel implementation" (2026-06-10) -->


# Decisions

Settled questions. Append-only. Each entry is dated.

---

## 2026-06-10 — Inline-completion design review

1. **Latency target ~0.5–1.5s (regime B).** Chat-on-Zen cannot hit sub-100ms FIM speed; that is accepted, not a bug. Shapes everything below.
2. **Adaptive short completions: `maxTokens` 64, no hard newline-stop.** Keeps p50 latency in budget while still allowing 2–3 line blocks. _Why:_ a newline-stop would kill legit multi-line like `if (x) {`. **⚠️ CORRECTED 2026-06-10 — the 64 cap proved unreliable (truncated multi-line; starved reasoning models that spend the budget in `<think>`); default is now `0` = uncapped. See the "Uncapped tokens + strip reasoning" entry below.**
3. **Non-streaming.** The VS Code inline API resolves a suggestion once, so streaming gives no perceived-latency win; only complexity. Revisit only if p95 annoys.
4. **API key in SecretStorage + `OPENCODE_API_KEY` env fallback; no plaintext setting.** _Why:_ a `settings.json` key leaks via Settings Sync / screen-share.
5. **Default model `opencode/minimax-m3` + per-request latency log + `listModels` command.** _Why:_ it's the id proven working against `go/v1` in the reference `llm-provider`; pick the real winner (`glm-5` / `kimi-k2.6`?) from the logged data. Model stays a setting. **⚠️ CORRECTED 2026-06-10 — see the "Bare model ids required" entry below: the prefixed id is rejected by this endpoint; the default is now the bare `minimax-m3`.**
6. **Trigger gating (sensible, not aggressive):** skip on empty/whitespace prefix, active selection, and native-IntelliSense-open (`selectedCompletionInfo`). _Why:_ no language-aware string/comment parsing — too brittle across languages.
7. **Single-entry last-result cache.** _Why:_ the dominant waste is same-position re-fires (VS Code re-queries on cursor moves/re-renders); one entry erases it cheaply.
8. **Status-bar heartbeat (ready/thinking/disabled/error), click toggles enabled.** _Why:_ regime-B latency is felt; the user needs "working vs frozen" signal.
9. **Strip prefix-overlap before returning.** _Why:_ chat models often echo the current line → doubled ghost text; the system prompt alone doesn't prevent it.

## 2026-06-10 — Side-panel feature (planned)

10. **Panel scope = key + model + enabled toggle.** Other settings stay in `settings.json`. _Why:_ matches the ask plus the one cheap, useful toggle; avoids scope creep into a full control center.
11. **Model picker = live `/models` list + free-text override + refresh.** _Why:_ discovery without locking the user out of unadvertised ids; manual field still works without a valid key.
12. **Stack = Preact + Tailwind v4, bundled by Vite into one unhashed asset; deprecated webview-ui-toolkit avoided (theme via `--vscode-*` vars).**
13. **Key is write-only from the webview** — UI sends the key, receives only `keyIsSet`, never the value back.
14. **Tests marked for the pure modules M1 (suggestion cleanup) + M2 (completion context)** — see `PRD.md`. M3–M6 are VS Code/DOM glue → manual/integration verify.
15. **PRD delivered as `PRD.md` in-repo** (project is greenfield / non-git at decision time, so a local doc is the "copy", not a GitHub issue).

## 2026-06-10 — Side-panel implementation (post-review)

**Decision:** Config writes (`model`, `enabled`) target the scope that already defines the value (`inspect()` → WorkspaceFolder / Workspace / else Global), not always `ConfigurationTarget.Global`.
**Why:** a Global write under a workspace override is silently ineffective — the controlled panel select/checkbox would snap back. Surfaced by the multi-agent review.
**Reversibility:** easy.

**Decision:** `opencodeAutocomplete.baseUrl` is `"scope": "machine"`.
**Why:** otherwise a malicious workspace could redirect requests — and the bearer API key — to an attacker endpoint. Side effect: baseUrl can no longer be set per-workspace (acceptable; it's near-constant).
**Reversibility:** easy (drop the scope line) but security-relevant — don't revert without reason.

**Decision:** `PanelState.keySource` is tri-state (`stored | env | none`), not a bare `keyIsSet` boolean; the webview Clear button is enabled only for `stored`.
**Why:** the `OPENCODE_API_KEY` env fallback made Clear look dead (deletes an absent secret, env key still resolves). Tri-state keeps the UI honest. Key value still never crosses to the webview.
**Reversibility:** easy.

**Decision:** No esbuild/webpack bundling — `vsce package` ships `openai` (and other prod `dependencies`) as-is.
**Why:** empirically verified the `.vsix` contains `node_modules/openai`; the prior "won't ship without bundling" assumption was false. Bundling stays a *size* optimization (1402 files), not a correctness requirement.
**Reversibility:** easy (add bundling later if package size matters).

## 2026-06-10 — Bare model ids required (corrects decision #5)

**Decision:** Model ids for `zen/go/v1` are **bare** (`minimax-m3`), never provider-prefixed (`opencode/minimax-m3`). `DEFAULT_MODEL`, the `opencodeAutocomplete.model` default, and `fetchModelIds` all use/return the bare form exactly as `GET /models` serves it.
**Why:** the chat endpoint returns `401 Model opencode/minimax-m3 is not supported` for the prefixed form. This **falsifies decision #5's** claim that `opencode/minimax-m3` was "proven working" — that was inherited from the reference `llm-provider`, which targets a different gateway; inline completions had been erroring the entire time. A mid-session experiment that *added* the `opencode/` prefix to the fetched list went the wrong way and was reverted.
**Reversibility:** easy to revert, but don't — the prefixed form is confirmed-rejected by this endpoint.

**Decision:** The panel auto-fetches the `/models` list once a key is set (on first state, key-set, or endpoint change), gated on origin change.
**Why:** the dropdown otherwise only filled on a manual ↻ button users didn't discover, so they only ever saw the single configured model. The origin gate prevents a refetch loop on an empty result and avoids re-firing on unrelated config pushes (model/enabled).
**Reversibility:** easy.

## 2026-06-10 — Uncapped tokens + strip reasoning (corrects decision #2)

**Decision:** `maxTokens` default → `0` (uncapped); `max_tokens` is sent only when the setting is `>0`. A new `stripThink` step removes inline `<think>…</think>` reasoning from the completion before insertion (an unterminated `<think>` → insert nothing).
**Why:** the served models (minimax-m3, mimo, qwen3*, glm5*) are **reasoning models** that emit chain-of-thought inline as `<think>…</think>`. With the 64-token cap they burned the whole budget thinking and never produced code, and even non-reasoning output got truncated mid-line — both surfaced as "broken / unreliable autocomplete". Uncapping lets the answer finish; `stripThink` keeps the reasoning out of the ghost text. Tradeoff: reasoning models are slow per keystroke — a non-reasoning id (`deepseek-v4-flash`, `kimi-k2.6`) is the snappy choice.
**Reversibility:** easy (re-cap via the setting), but don't default it back — the cap is what made it unreliable.

## Related
- [[overview]]
- [[gotchas]]
