---
type: active-work
project: wisp
updated: 2026-07-20
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-20 by Fable 5 (wrap-up)._
_At commit: e31bcfc + this wrap-up commit (2.0.24 planning, no code yet)._

## Current focus

**2.0.24 planned, not started.** v2.0.23 confirmed landed (release green, npm
at 2.0.23). The whole .24 scope went through the init funnel: grill →
happy-path MVD → spec **#126** → six slices **#127–#132**, all published
`ready-for-agent` on GitHub.

## State

- **In flight:** nothing — implementation belongs to the ticket loop.
- **Done this session:**
  1. Grill settled the design (see [[2026-07-20-row-based-routing-snapshots-cli]]
     and spec #126): row-based `wisp snapshot`/`revert`, aliases included,
     verb `revert`, refuse-if-held, CLI-only, store in `~/.wisp` config;
     Tab-complete fills-never-runs; copied indicator = feedback-row note
     (option a), ~1.5 s; `/bridge` blurb becomes a why-explanation
     (wording approved, in #130 + spec).
  2. **Snapshot** term added to `CONTEXT.md`; two MVD spines appended to
     [[happy-path]].
  3. Published: spec #126; slices #127 (snapshot e2e) · #128 (tab-complete) ·
     #129 (copied indicator) · #130 (blurb) · #131 (Slot skill CLI-native,
     blocked by #127) · #132 (release 2.0.24, blocked by all).
  4. Seeded the relay chain state at `.claude/relay/ticket-loop.md` — one
     issue per leg, dynamic pacing (N=1), `/preset ticket-loop` body.
- **Blocked:** none.

## Pick up here

Start the chain: `/relay N=1 /preset ticket-loop` — each leg rehydrates from
`.context/` at boot (relay step 3), works ONE frontier ticket, relays fresh.
Frontier now: #127, #128, #129, #130 (all unblocked; #127 first — #131 waits
on it). Or work tickets by hand in that order.

## Skills for next session

- `/relay N=1 /preset ticket-loop` — the intended driver for #127–#132.
- `/preset ci-babysit` once #132's tag is pushed.

## Open questions

- None. Design settled in spec #126; seams follow the routing-CLI precedent
  (pure core decision fn + thin TUI edge).

## Recent context

- When **#131** lands (Slot skill rewrite): sync the ecosystem-kb vault page
  for the slot lineup in the same session (standing rule — skill behavior
  change is an ecosystem change).
- Snapshot has NO compare-and-set: revert writes unconditionally and prints
  the overwritten value; the skill pre-reads `wisp routing` if it wants a
  guard.
- Copied-indicator trap agreed in grill: the ~1.5 s clear timer must not wipe
  a *newer* status message.
- Release contract unchanged: tag `v2.0.24` must equal `packages/tui/package.json`
  version; stop any running `wisp.exe` before a global npm reinstall.

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
