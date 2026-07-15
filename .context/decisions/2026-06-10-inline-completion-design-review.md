---
type: decision
project: wisp
updated: 2026-06-10
tags: [context, decisions]
---

# Inline-completion design review

1. **Latency target ~0.5–1.5s (regime B).** Chat-on-Zen cannot hit sub-100ms FIM speed; that is accepted, not a bug. Shapes everything below.
2. **Adaptive short completions: `maxTokens` 64, no hard newline-stop.** Keeps p50 latency in budget while still allowing 2–3 line blocks. _Why:_ a newline-stop would kill legit multi-line like `if (x) {`. **⚠️ CORRECTED 2026-06-10 — the 64 cap proved unreliable (truncated multi-line; starved reasoning models that spend the budget in `<think>`); default is now `0` = uncapped. See the "Uncapped tokens + strip reasoning" entry below.**
3. **Non-streaming.** The VS Code inline API resolves a suggestion once, so streaming gives no perceived-latency win; only complexity. Revisit only if p95 annoys.
4. **API key in SecretStorage + `OPENCODE_API_KEY` env fallback; no plaintext setting.** _Why:_ a `settings.json` key leaks via Settings Sync / screen-share.
5. **Default model `opencode/minimax-m3` + per-request latency log + `listModels` command.** _Why:_ it's the id proven working against `go/v1` in the reference `llm-provider`; pick the real winner (`glm-5` / `kimi-k2.6`?) from the logged data. Model stays a setting. **⚠️ CORRECTED 2026-06-10 — see the "Bare model ids required" entry below: the prefixed id is rejected by this endpoint; the default is now the bare `minimax-m3`.**
6. **Trigger gating (sensible, not aggressive):** skip on empty/whitespace prefix, active selection, and native-IntelliSense-open (`selectedCompletionInfo`). _Why:_ no language-aware string/comment parsing — too brittle across languages.
7. **Single-entry last-result cache.** _Why:_ the dominant waste is same-position re-fires (VS Code re-queries on cursor moves/re-renders); one entry erases it cheaply.
8. **Status-bar heartbeat (ready/thinking/disabled/error), click toggles enabled.** _Why:_ regime-B latency is felt; the user needs "working vs frozen" signal.
9. **Strip prefix-overlap before returning.** _Why:_ chat models often echo the current line → doubled ghost text; the system prompt alone doesn't prevent it.

## Related

- [[decisions]] — index
