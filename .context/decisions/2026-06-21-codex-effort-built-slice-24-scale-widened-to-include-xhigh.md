---
type: decision
project: wisp
updated: 2026-06-21
tags: [context, decisions]
---

# Codex Effort built (slice #24); scale widened to include `xhigh`

**Decision:** Shipped the side-panel Effort knob per PRD #23. `codexReasoning(model)` →
`codexReasoning(model, effort)` (default `medium`); new `CodexEffort` type + `DEFAULT_EFFORT`. One global
value in **globalState `wisp.effort`** (read `activeEffort()`, write `setEffort()`), threaded to BOTH
surfaces through the single `codexResponsesRequest` chokepoint (`codexClient.ts`) — Inquire via
`codexInquire`, native chat via `codexStream` + `deps.codexEffort()`. Panel: `PanelState.effort` +
`selectEffort` message + `setEffort` host action + a Codex-gated `<select>`. **Effort scale widened
`low`/`medium`/`high` → +`xhigh`** (Codex codex-max models accept it; the user flagged it) — one literal
union across `catalog.ts`/`sidePanelProvider.ts`/`webview/app.tsx`. `CONTEXT.md` Effort term updated and the
stale "Inquire is Wisp's single feature" line corrected. `npm test` 139/139, tsc+webview+vite clean, F5
PASSED (knob Codex-only; message sent on a selected effort).
**Why:** the effort plumbing already half-existed (hardcoded `medium`), so one chokepoint makes both
surfaces honor a single value — "set it once." Global (not per-model/per-surface) is less code and mirrors
the per-Provider model-memory design. The non-reasoning gating already in `codexReasoning` makes Effort
inert for `spark`/`gpt-4.x` for free. **`setEffort` must call `panel.postState()` itself** — a globalState
write fires no `onDidChangeConfiguration` event, unlike `setModel`'s `wisp.model` mirror (the main wiring
trap; don't remove that line).
**Reversibility:** easy. Per-model / per-surface / cross-provider Effort stay additive refinements (later).
`xhigh` paired with a non-codex-max model may 400 — accepted (one global value; user's pairing call).

## Related

- [[decisions]] — index
