---
type: active-work
project: wisp
updated: 2026-07-22
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-22 by Fable 5 (relay leg 2 wrap-up)._
_At commit: 76e4fba (#159 fix on main)._

## Current focus

**Working the cache-triage ticket queue via relay — one ticket per leg.**
#158 (leg 1) and #159 (leg 2) done; #160 is the last queue item.

## State

- **In flight:** nothing. Working tree clean on main at 76e4fba.
- **Done this leg:** **#159 closed** — the STALE cache-diagnosis advisory in
  `packages/core/src/bridgeServer.ts` no longer asserts "concurrent send" as
  the cause; it states the observable (bill contradicts the server verdict →
  stale compare target) and names both known shapes (concurrent send,
  prefix-variant flip) without asserting either. No tests asserted the old
  wording (verified by search). 634/634 + compile green. Landed straight on
  main (small-diff rule), pushed.
- **Queue:** #160 (investigate who drops the advisor field mid-conversation —
  user toggle vs panel flap vs a request class; clue: lone `effort=high`
  request in the no-advisor cluster; may end in a wisp-side fix ticket or a
  documented benign cause, possibly no code).
- **Plan:** relay chain continues — next leg picks #160 (last queue item).
  Exact command + per-leg contract live in [[pick-up]].
- **Blocked:** nothing.

## Pick up here

Work #160 — investigation ticket, deliverable is a written cause on the
ticket (+ follow-up ticket if wisp-side), not necessarily code. After #160
the queue is empty → the relay chain stops itself.

## Skills for next session

- `/preset pick-up` — note carries the relay command + per-leg contract.
- `/preset ticket-loop` — the loop body the relay fires.
- `packages/tui:verify` — sandboxed CLI verification for TUI command-surface changes.

## Open questions

- #160's question: what drops the `advisor` field mid-conversation? (Tracked
  as the ticket, not answered.)

## Recent context

- **#159 mechanics (this leg):** wording-only change to the STALE advisory
  log line + its comment in `bridgeServer.ts` (~line 682). The
  `anthropicDiagnosisStale` doc comment in `anthropic.ts:491` was left alone
  deliberately — it already hedges ("can") and ends on the observable.
- **Advisor-flap cache economics:** advisor tool rides in the cached prefix;
  flip = full prefix re-write, flapping = double-billed history deltas. Both
  variants stay warm so bills look healthy between flips. Details in the
  gotcha [[advisor-toggle-forks-the-cache-prefix-two-variants]].
- **Diagnosis chain landmines (still true):** key = model + FIRST user turn
  (+ tool names since #158) — leading system churn must not shift it
  (tested). Server diagnosis null ≠ healthy — never let it suppress the
  heuristic. `selectAnthropicBetas` gates are EXCLUSION lists; diagnosis
  token rides LAST.
- **Live-check technique:** scratchpad bun script importing core src with
  stored `~/.wisp/auth.json` creds; haiku's min cacheable prefix is 4096
  tokens — pad fillers past it.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
- [[2026-07-21-server-cache-diagnosis-adopted]]
