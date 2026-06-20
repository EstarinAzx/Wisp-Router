---
type: pick-up
project: wisp
updated: 2026-06-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate.

**Last session (2026-06-21):** Built + verified **slice #25 — "Model-picker label mirrors Effort"** on
branch **`feat/codex-effort`** (committed this session). `buildChatModelInfos` (`catalog.ts:~299`) now
appends ` · <effort>` to a Codex row's picker name — gated by `isCodexProvider(p) && codexReasoning(model)`,
so only reasoning-capable Codex rows show a depth (spark/gpt-4.x and every non-Codex row are untouched).
Effort arrives via a new optional `state.effort`, fed by `deps.codexEffort()` at `chatProvider.ts:~116`.
Raw lowercase token (`· high`). **`npm test` 139 → 141** (+2: reasoning row suffix, spark row no-suffix),
tsc+webview clean, **F5 PASSED**. **This completes PRD #23** (slices #24 + #25 both done).

**Next task: SHIP PRD #23.** Enter with **`/preset ship`** — push `feat/codex-effort` and open a PR to
`main` composed from the #24 + #25 diff. Nothing to build; the branch is feature-complete and verified.

**Landmines / things to know:**
- **Two Wisp extensions collide under F5.** The old installed VSIX `local.wisp@1.1.0` + the dev build
  `EsarinAzx.wisp` both contribute `wisp.*` settings → "already registered" warnings + a STALE panel.
  **Uninstall `local.wisp` before any F5** (`code --uninstall-extension local.wisp`). See [[gotchas]].
- **No live-refresh event for the label** — the picker re-queries `provideLanguageModelChatInformation`
  on open (chatProvider is stateless; no `onDidChange…` event exists in the finalized 1.104 API). The
  label updates on next picker open. This is the accepted behavior, not a gap.
- **`CLAUDE.md` is still uncommitted** (a pre-existing, unrelated ecosystem-KB/handoff/trace edit, NOT
  this work) — left out of both the #24 and #25 commits deliberately. Decide its fate separately.
- **`xhigh` × model:** one global effort, no per-model gating — `xhigh` on a non-codex-max model may 400.
  By design (PRD "set it once").

Full state in [[active-work]]; settled choices in [[decisions]]; traps in [[gotchas]]; domain language in `CONTEXT.md`.
