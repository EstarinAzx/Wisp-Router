---
type: decision
project: wisp
updated: 2026-06-23
tags: [context, decisions]
---

# Anthropic `max` effort + picker mirrors the first-party `/effort` slider (#32)

**Decision:** Added the `max` level. Type = `EffortLevel = CodexEffort | 'max'` superset (not overloading
`CodexEffort` — Codex's wire tops at `xhigh`). Wire clamp in `anthropicThinkingEffort`: `max→high` on non-max
models (`modelSupportsAnthropicMax = /opus-4-[678]/`), beside the existing `xhigh→high`. Codex normalizes a
stored `max→xhigh` (`standardEffortToCodex`) at every send-site. **The picker is provider-only, NOT
model-gated** — `effortOptionsFor(provider)` shows Anthropic the full `low→max` ladder regardless of model;
Codex stops at `xhigh`.
**Why:** Issue #32 specified per-model `max` gating ("`max` 400s on Sonnet"). But the first-party Claude Code
`/effort` slider exposes the full ladder for Sonnet 4.6 and clamps the *applied* value to `high` (the header
read "Sonnet 4.6 with high effort" while the slider caret sat past `high`). Taxonomy verified against
openclaude `src/utils/effort.ts`: `max` = Opus 4.6/4.7/4.8, `xhigh` = Opus 4.7/4.8, Sonnet 4.6 / Opus 4.5 take
neither. So capability belongs in the wire clamp (single source of truth) and the picker just mirrors official
— simpler than per-model option computation, and honest to what the first-party client shows. 6 new tests,
`npm test` 204/204, tsc+webview+vite clean. Shipped with #28–#31 as release **1.3.0** to `main`.
**Reversibility:** easy (picker list + clamp are localized to `catalog.ts`).

## Related

- [[decisions]] — index
