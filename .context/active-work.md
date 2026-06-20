---
type: active-work
project: wisp
updated: 2026-06-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-21 by Opus 4.8._
_At branch: `feat/codex-effort` — slice #24 committed (`aa1f5ad`); this session commits **slice #25**.
`main` = `ec60e62`. Also uncommitted on the branch: a pre-existing `CLAUDE.md` edit (ecosystem-KB /
handoff / trace sections — NOT this work), deliberately left out of both commits; decide its fate
separately._

## Current focus
**PRD #23 (Codex Effort control) is COMPLETE** — both slices built + verified on `feat/codex-effort`.
- **#24** — a side-panel **Effort** knob (`low`/`medium`/`high`/`xhigh`) for the Codex Provider replaces
  the hardcoded `medium` and governs **every** Codex call (Inquire + chat) via one global value.
- **#25** — the model-picker label now mirrors that Effort (`Codex — gpt-5.3-codex · high`).

**Next: ship.** `feat/codex-effort` (#24 + #25) → PR to `main` via **`/preset ship`**.

## State
- **Slice #25 — DONE (committing this session).** `buildChatModelInfos` appends ` · <effort>` to a Codex
  row's name, gated by `isCodexProvider(p) && codexReasoning(model)` (reasoning rows only; spark/gpt-4.x
  and non-Codex rows get nothing). New optional `state.effort`, fed by `deps.codexEffort()` at the
  `chatProvider.ts:~116` call site. Raw lowercase token, matching the panel `<select>`. **`npm test`
  139 → 141** (+2 tests: reasoning row suffix, spark row no-suffix), tsc+webview clean, **F5 PASSED**
  (picker shows the suffix on a Codex reasoning row).
- **Slice #24 — DONE, committed `aa1f5ad`.** `codexReasoning(model, effort)`; `CodexEffort` type +
  `DEFAULT_EFFORT='medium'`; `wisp.effort` globalState (`activeEffort`/`setEffort`); Codex-gated panel
  `<select>`. One global value, threaded through the `codexResponsesRequest` chokepoint.
- **No existing test broke** — the only Codex `buildChatModelInfos` test asserts `capabilities`, not
  `name`, so the suffix was purely additive (the prior handoff feared otherwise; it was wrong).
- **Blocked:** Marketplace publish still pending a real `publisher` + Azure DevOps PAT (user creds).

## Pick up here
1. **Ship PRD #23** — **`/preset ship`** opens a PR on `feat/codex-effort` (#24 + #25) → `main`.
2. Before any F5: uninstall `local.wisp` (the old VSIX collides with the dev build — stale panel). See
   [[gotchas]].

## Skills for next session
- `/preset ship` — push `feat/codex-effort` and open the PR (#24 + #25).

## Open questions
- Carried over (latent): replayed `function_call` items send `call_id` only (add a derived `fc_…` `id`
  only if a multi-turn round-trip 400s); `codexModelCaps` vision is blanket-`true`. See [[gotchas]].
- **`xhigh` × model pairing:** one global effort, no per-model gating — `xhigh` on an older
  `gpt-5`/`o3` may 400 (only codex-max honors it). User's pairing responsibility, by design (PRD "set it once").
- **`CLAUDE.md`** is uncommitted (pre-existing ecosystem-KB/handoff/trace edit, unrelated to PRD #23) —
  decide separately whether it belongs in this branch or its own commit.

## Recent context
- **#25 label decision:** suffix only when `codexReasoning(model)` is truthy — reusing that exact gate
  makes label-honesty == reasoning-honesty for free; no separate "is this row reasoning?" check.
- **No live-refresh event:** the picker re-calls `provideLanguageModelChatInformation` on open
  (chatProvider is stateless; confirmed no `onDidChange…` event in the finalized 1.104 API) — so the
  label updates on next picker open, no event wiring needed.
- **Dev-environment dup trap (carried):** the old installed VSIX (`local.wisp@1.1.0`) + the F5 dev build
  (`EsarinAzx.wisp`) both contribute `wisp.*` → "already registered" warnings + a stale panel. Uninstall
  `local.wisp` before F5. See [[gotchas]].

## Related
- [[overview]]
- [[decisions]]
- [[gotchas]]
- [[api]]
