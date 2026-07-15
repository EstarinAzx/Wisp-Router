---
type: decision
project: wisp
updated: 2026-06-23
tags: [context, decisions]
---

# Anthropic thinking/effort parity (slice "#31", branch `feat/anthropic-thinking-effort`)

Claude chat/Inquire now honor the shared `wisp.effort` knob. The wire contract (extracted from openclaude, the
reference subscription client — `src/utils/effort.ts`, `src/services/api/claude.ts`, `src/constants/betas.ts`):

1. **Effort rides `output_config.effort`** (a string `low|medium|high|xhigh`), NOT a top-level `effort` and NOT
   `thinking.budget_tokens` (the latter 400s on Opus 4.7+). The original plan note missed the nesting.
2. **The `effort-2025-11-24` beta header is load-bearing** — without it the backend silently drops
   `output_config.effort`. Added to `ANTHROPIC_BETA` (now `claude-code-20250219,oauth-2025-04-20,effort-2025-11-24`).
   The note missed this entirely.
3. **Thinking is `{type:'adaptive'}`** (no budget) for adaptive-capable models. Coupled with effort in
   `anthropicThinkingEffort` deliberately: the wired path always passes a non-undefined effort (`activeEffort()`
   defaults `medium`), and the coupling keeps the pre-#31 body byte-identical when no effort is threaded.
4. **Model-gated:** effort fields emitted only for `/opus-4-[5-8]/` + `sonnet-4-6` (Haiku/older 400). **`xhigh`
   clamps to `high`** on all but Opus 4.7/4.8 (the panel offers `xhigh` for every effort-aware Provider; Sonnet
   4.6 400s on it) — mirrors openclaude `resolveAppliedEffort`.
5. **The effort knob is now shared** Codex+Anthropic — the `chatProvider` dep `codexEffort` → `effort`; the panel
   Effort select is data-gated (`state.effort !== undefined`), populated for both OAuth Providers.

**Probe resolved positive:** F5 confirmed the subscription OAuth path accepts the new body fields with no
synthetic-429 (openclaude was already strong evidence; the #28 fingerprint samples first-user-message text only,
never body fields). 9 new tests, `npm test` 196/196, tsc+webview+vite clean. Reviewed (cavecrew-reviewer): the
`xhigh` 400 + the `[5-9]` over-match were caught pre-commit and fixed.

**Deferred → issue #32:** `max` effort. Needs widening the shared effort type past `xhigh`, per-model panel
option gating (`max` is Opus-4.6+-only), a `max→high` clamp, and cross-provider normalization (Codex maps a
stored `max`→`xhigh`). The `xhigh` clamp in this slice is the template.

## Related

- [[decisions]] — index
