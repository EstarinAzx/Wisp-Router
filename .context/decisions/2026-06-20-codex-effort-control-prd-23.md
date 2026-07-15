---
type: decision
project: wisp
updated: 2026-06-20
tags: [context, decisions]
---

# Codex Effort control (PRD #23)

**Decision:** Add a side-panel **Effort** knob (`low`/`medium`/`high`) for the **Codex Provider**, replacing
the hardcoded `medium` in `codexReasoning`. **One global** value (not per-model), governing **every** Codex
call — Inquire *and* chat — and mirrored in the model-picker label (`Codex — gpt-5 · High`). Codex-only
tracer; other Provider kinds deferred. Scoped as PRD #23 → slice #24 (knob + behavior, unblocked) and
slice #25 (picker label, blocked by #24).
**Why:** the effort plumbing already half-existed for Codex (just hardcoded), so the tracer is small and
honest there. Global + provider-wide is *less* code than a per-model or per-surface split and matches "set
it once." Explicitly **not** replicating Copilot's `·3x` request multiplier — that is GitHub's billing weight
on its *own* models and has no BYOK equivalent; only the Effort label is reproduced. Term defined in
`CONTEXT.md`. The prior open question ("Codex reasoning effort fixed at `medium`; make per-model if one needs
`high`") is superseded — it becomes user-settable here.
**Reversibility:** easy — per-model / cross-provider / per-surface are additive refinements, not rewrites.

## Related

- [[decisions]] — index
