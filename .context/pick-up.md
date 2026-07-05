---
type: pick-up
project: wisp
updated: 2026-07-06
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Codex streaming cutoff — FIXED, merged, user-confirmed working (v1.4.2, `main` @ `f552995`).**
Intermittent blank/cut-off Codex replies on `gpt-5.5 · high` were the stream *ending badly, silently*.
`codexStream` now guards the stream end (empty drop → throw; partial → keep + soft marker; `response.incomplete`
→ visible truncation marker), logs cancels, and documents why `max_output_tokens` stays omitted. 244 tests green,
build clean, `wisp-1.4.2.vsix` built. PR #42 squash-merged. Full write-up: `CODEX-STREAM-CUTOFF-FINDINGS.md`.
Files: `src/codexClient.ts`, `src/catalog.ts`, `src/chatProvider.ts`, `src/codex.test.ts`.

## Nothing forced next. Optional follow-ups
- **Release v1.4.2** — `wisp-1.4.2.vsix` is built but not attached to a GitHub release (`gh release create`).
- **Deferred hang-watchdog (FINDINGS §6)** — only if a cut-off ever recurs as a silent *hang* (turn never ends,
  no marker, no throw) rather than a drop. Then mirror the Codex CLI: `stream_idle_timeout_ms` + bounded retry.
- **Optional:** add `CODEX-STREAM-CUTOFF-FINDINGS.md` to `.vscodeignore` so the dev doc isn't bundled in the vsix.
- **Still OPEN (prior session):** agent-mode **vision** intermittency — unrelated to this fix.

## Landmines
- **Never send `max_output_tokens` for Codex.** gpt-5.x/o-series reject it (400 'not permitted'); it would
  break every gpt-5.5 turn. The Anthropic sibling's `max_tokens` is a false-analogy trap. Comment guards it.
- **Before any F5:** uninstall the installed Wisp (dup trap serves a stale panel). New terminal after Start.
- `.context/flows.md` is untracked and **not mine** — leave it out of commits.
- Agent-mode **vision** intermittency is still OPEN from the prior session (unrelated to this fix).

## Related
- [[active-work]] · [[overview]] · [[gotchas]]
