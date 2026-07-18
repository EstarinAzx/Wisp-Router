---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — review branch shipped as v2.0.15)._
_At commit: `df913e6` on `main` (pushed, tagged `v2.0.15`, released, binary installed)._

## Current focus

**Nothing in flight — clean slate.** The #111 cache follow-up cycle is fully
shipped: all three remote-session fixes plus the review session's forward-slide
hardening are merged to `main`, released as `wisp-router@2.0.15`, and the
installed `claude-wisp` binary has them. The Anthropic-OAuth path now caches
like native unwisped Claude Code (spread breakpoints, 1h TTL, is_error
fidelity). Feature branches deleted local + remote.

## State

- **In flight:** None.
- **Done this session:**
  - Reviewed `git diff main` on `claude/review-context-rehydration-cj5mer`
    (walk-back loop logic, breakpoint budget, is_error threading) — no findings.
    Fresh verify: compile clean, 477/477 tests.
  - Fast-forward merged to `main` (`f1fe5d6` → `3a7c4e0`), pushed.
  - **Live-verified the 1h TTL pre-release caveat:** started Bridge from source
    (sole listener on 41184), one-shot `claude-wisp -p` round-trip; Bridge log
    confirmed `route family 'claude-fable-5' -> anthropic`; OAuth endpoint
    accepted the `ttl:'1h'` body, no 400.
  - Released v2.0.15: tui bump 2.0.14→2.0.15, span-baseline recaptured
    (32 Screens), CHANGELOG entry, tag pushed, release.yml green on all four
    runners, npm publish confirmed (`npm view wisp-router version` = 2.0.15).
  - Reinstalled global binary — splash confirms v2.0.15.
  - Deleted `claude/context-rehydration-oargfe` +
    `claude/review-context-rehydration-cj5mer` (local + origin).
- **Held deliberately (fidelity/UX backlog, NOT bugs — see [[pick-up]]):**
  thinking-block preservation (needs a design pass — signature 400s +
  non-Anthropic routing), `document`/PDF passthrough (feature, only if users
  feed PDFs), TUI model-switch cache warning in `routingScreens.tsx`
  (speculative, build only if hit).
- **Blocked:** None.

## Pick up here

See [[pick-up]]. No mandatory next task — next session picks new work or one of
the held backlog items.

## Open questions

- Do the held fidelity gaps ever get built? Thinking preservation is the
  architecturally significant one — discuss before implementing (CLAUDE.md §3).
- Elucidate's badge is also purple — unrelated older open question, still open.

## Recent context

- The shipped #111 fix (`e5ec476`, 2.0.10) killed the big 5–10x burn; this
  2.0.15 cycle closed the bounded residuals (fat-turn lookback overshoot,
  5-min idle expiry) and the is_error fidelity gap. Quota parity with native
  Claude Code is now believed complete on the Anthropic-OAuth path.
- Test suite totals: core vitest **477**, tui bun test 13.
- `wisp --version` is not a flag — version reads off the TUI splash.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
