---
type: pick-up
project: wisp
updated: 2026-07-06
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Codex streaming cutoff — FIXED & shipped as v1.4.2** (branch `fix/codex-stream-cutoff`, PR open, NOT merged).
Intermittent blank/cut-off Codex replies on `gpt-5.5 · high` were the stream *ending badly, silently*.
`codexStream` now guards the stream end (empty drop → throw; partial → keep + soft marker; `response.incomplete`
→ visible truncation marker), logs cancels, and documents why `max_output_tokens` stays omitted. 244 tests green,
build clean, `wisp-1.4.2.vsix` built. Full write-up: `CODEX-STREAM-CUTOFF-FINDINGS.md`. Files:
`src/codexClient.ts`, `src/catalog.ts`, `src/chatProvider.ts`, `src/codex.test.ts`.

## Next task (only if pursuing it)
**Runtime-confirm the fix on the live backend** — it was NOT F5-verified (needs a ChatGPT sub). Reproduce a
cut-off on `gpt-5.5 · high` in native chat; the next repro self-diagnoses (see FINDINGS §7):
- thrown "stream ended before completion" → D3 hard drop (working as intended, retryable).
- `_[Response truncated: <reason>]_` → D1 backend truncation.
- `[cancel] … aborted mid-stream` in the Wisp output channel → a supersede/stop, not a bug.
- **still blank, no marker, no throw** → the deferred **hang** case → graduate the idle-timeout watchdog
  (FINDINGS §6) from optional to a real fix (mirror the Codex CLI: `stream_idle_timeout_ms` + bounded retry).

Then merge the PR and, if wanted, cut a GitHub release with `wisp-1.4.2.vsix` attached.

## Landmines
- **Never send `max_output_tokens` for Codex.** gpt-5.x/o-series reject it (400 'not permitted'); it would
  break every gpt-5.5 turn. The Anthropic sibling's `max_tokens` is a false-analogy trap. Comment guards it.
- **Before any F5:** uninstall the installed Wisp (dup trap serves a stale panel). New terminal after Start.
- `.context/flows.md` is untracked and **not mine** — leave it out of commits.
- Agent-mode **vision** intermittency is still OPEN from the prior session (unrelated to this fix).

## Related
- [[active-work]] · [[overview]] · [[gotchas]]
