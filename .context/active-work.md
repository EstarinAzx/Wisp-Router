---
type: active-work
project: wisp
updated: 2026-07-22
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-22 by Fable 5 (relay leg 1 wrap-up)._
_At commit: 4123dc1 (#158 fix on main)._

## Current focus

**Working the cache-triage ticket queue via relay — one ticket per leg.**
#158 done this leg; #159 and #160 remain (`ready-for-agent`, independent).

## State

- **In flight:** nothing. Working tree clean on main at 4123dc1.
- **Done this leg:** **#158 closed** — diagnosis chain key now folds in the
  tool lineup's names (`model + first user turn + tool names`). Advisor
  on/off prefix variants chain separately; a flip turn reads as the silent
  null-chain case instead of producing spurious STALE advisories. New unit
  test + existing #139 system-churn guard green (634/634), compile clean.
  Landed straight on main (small-diff rule), pushed.
- **Queue:** #159 (STALE advisory wording stops asserting "concurrent send" —
  small, bridge log line), #160 (investigate who drops the advisor field
  mid-conversation — user toggle vs panel flap vs a request class; clue:
  lone `effort=high` request in the no-advisor cluster; may end in a
  wisp-side fix ticket or a documented benign cause, possibly no code).
- **Plan:** relay chain continues — next leg picks #159 (oldest first).
  Exact command + per-leg contract live in [[pick-up]].
- **Blocked:** nothing.

## Pick up here

Work the frontier: #159 then #160 (independent; `/preset ticket-loop` picks
oldest first). #159 is a small single-file change; #160 is investigation.

## Skills for next session

- `/preset pick-up` — note carries the relay command + per-leg contract.
- `/preset ticket-loop` — the loop body the relay fires.
- `packages/tui:verify` — sandboxed CLI verification for TUI command-surface changes.

## Open questions

- #160's question: what drops the `advisor` field mid-conversation? (Tracked
  as the ticket, not answered.)

## Recent context

- **#158 mechanics (this leg):** discriminator is tools-only — the advisor
  tool already arrives in `parsed.tools` at the Anthropic arm's chain call
  site (advisorTools substitution upstream in bridgeServer), so the fix was
  key-shape only, no new plumbing. Omitted tools ≡ empty lineup = its own
  variant.
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
