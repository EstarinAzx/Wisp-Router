---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — verified 2.0.19 live, diagnosed codex 502)._

## Current focus

**None.** 2.0.19 shipped and confirmed live. Openclaude steal #1: one-shot bodies write
bare `{type:'ephemeral'}` (5m, 1.25×); multi-turn (`convo.length >= 2`) keep `ttl:'1h'`.
Breakpoints (#111) untouched.

## State

- **In flight:** None.
- **Done this session (no code):**
  - Confirmed daily driver on `wisp-router@2.0.19` (= npm latest) AND the running bridge
    (PID started 16s after the install) is already on that binary — no restart needed.
  - Diagnosed the codex `502 … input exceeds the context window` — provider window limit
    (400K gpt-5.x / 200K o-series), bridge relays it untrimmed. Not a bridge bug.
  - Logged it as a gotcha + parked bridge-side pre-trim as a floating plan.
- **Verified:** `npm ls -g` = 2.0.19; bridge process start-time vs install mtime.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. 2.0.19 is live end-to-end; drive normal. No code pending. Codex 502s are
operational — `/compact` before codex turns, not a bug to chase.

## Open questions

- Optional #3 (`skipCacheWrite` for forks) only if bridge grows shared-prefix side calls.
- **Floating:** bridge could pre-trim conversation to fit codex windows (400K gpt-5.x
  / 200K o-series) to kill the "input exceeds context window" 502s. Deferred — lossy,
  needs a drop policy (which turns to shed), and today `/compact` before codex turns
  covers it. Build only if the 502s become frequent.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-18-openclaude-cache-control-steal-list]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
