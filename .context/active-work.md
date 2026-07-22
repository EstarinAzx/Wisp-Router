---
type: active-work
project: wisp
updated: 2026-07-22
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-22 by Fable 5 (wrap-up)._
_At commit: 03d6086 (v2.0.32 release — STALE advisory logging on main)._

## Current focus

**Cache-log triage → three-ticket queue.** User's bridged-session logs were
diagnosed: caching machinery healthy (STALE downgrades correct, #145 PARTIAL
known), but an advisor on/off toggle mid-session forked the cache prefix — one
real ~95K re-write plus advisory noise. No code changed this session; findings
became tickets **#158, #159, #160** (all `ready-for-agent`, no blocking edges)
and gotcha [[advisor-toggle-forks-the-cache-prefix-two-variants]].

## State

- **In flight:** nothing. Working tree clean on main at v2.0.32.
- **Queue:** #158 (diagnosis chain key gets a tools-based variant
  discriminator; system-churn key stability must survive), #159 (STALE
  advisory wording stops asserting "concurrent send"), #160 (investigate who
  drops the advisor field mid-conversation — user toggle vs panel flap vs a
  request class; clue: lone `effort=high` request in the no-advisor cluster).
- **Plan:** user runs the queue via relay — one ticket per leg, gateless
  wrap-up after each slice. Exact command lives in [[pick-up]].
- **Done this session:** log diagnosis (advisor-flap → prefix fork → STALE
  chain explained), issues #158/#159/#160 filed, gotcha recorded.
- **Blocked:** nothing.

## Pick up here

Work the frontier: any of #158/#159/#160 (independent). `/preset ticket-loop`
picks oldest first. #158/#159 are small single-file changes (core: anthropic
diagnosis chain / bridge log line); #160 is investigation, may end in a
wisp-side fix ticket or a documented benign cause.

## Skills for next session

- `/preset pick-up` — note carries the relay command + per-leg contract.
- `/preset ticket-loop` — the loop body the relay fires.
- `packages/tui:verify` — sandboxed CLI verification for TUI command-surface changes.

## Open questions

- #160's question: what drops the `advisor` field mid-conversation? (Tracked
  as the ticket, not answered.)

## Recent context

- **v2.0.31 + v2.0.32 landed since last handoff** (previous session):
  'unavailable' miss reason reads as no-diagnosis; server miss verdicts the
  bill contradicts log as STALE advisory. Both shipped; this session's logs
  show them working live.
- **Advisor-flap cache economics:** advisor tool rides in the cached prefix;
  flip = full prefix re-write, flapping = double-billed history deltas. Both
  variants stay warm so bills look healthy between flips. Details in the
  gotcha.
- **Diagnosis chain landmines (still true):** key = model + FIRST user turn —
  leading system churn must not shift it (tested); #158's discriminator must
  be tools-based, never system-based. Server diagnosis null ≠ healthy — never
  let it suppress the heuristic. `selectAnthropicBetas` gates are EXCLUSION
  lists; diagnosis token rides LAST.
- **Live-check technique:** scratchpad bun script importing core src with
  stored `~/.wisp/auth.json` creds; haiku's min cacheable prefix is 4096
  tokens — pad fillers past it.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
- [[2026-07-21-server-cache-diagnosis-adopted]]
