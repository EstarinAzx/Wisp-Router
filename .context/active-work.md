---
type: active-work
project: wisp
updated: 2026-07-23
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-23 by Fable 5 (#161 wrap-up)._
_At commit: 7b632d7 (release 2.0.34 on main, pushed; tag v2.0.34, CI green)._

## Current focus

**#161 + #162 shipped and released.** Bridge auto-handles provider usage-limit
429s (#161, 2.0.34: cooldown until `resets_in_seconds`, family-matched
`claude-*` routes fall back to anthropic meanwhile) and the PARTIAL advisory
stopped crying wolf on healthy incremental growth (#162, 2.0.35:
per-conversation growth tracker — prior write read back → silent; not read
back → line fires with `expected>=N` evidence). 2.0.34 CI green; 2.0.35 CI
was in flight at wrap-up — check `gh run list` if unconfirmed.

## State

- **In flight:** nothing. Working tree clean on main except this `.context/`
  wrap-up commit. Main is pushed through 7b632d7.
- **Done this session:** #161 (feat 5bcff26 + release 7b632d7) — pure logic in
  `routing.ts` (`parseUsageLimitReset`, `createProviderCooldowns`,
  `withCooldownFallback`), wired in `bridgeServer.ts` (`routeFor` + all five
  provider catch blocks). 14 new tests in `routing.test.ts` (645 total green);
  smoke-verified `serve` boot on an isolated `WISP_HOME`. Design limits in
  [[2026-07-23-usage-limit-cooldown-family-fallback-only]].
- **User action pending:** restart the running Bridge (still on pre-#161 code)
  and update the installed `wisp-router` to 2.0.34 if running from npm.
- **Queue:** empty. Open: #69 (backlog, copilot-wisp launcher, needs grooming).
- **Blocked:** nothing.

## Pick up here

No queued agent work. Next session: user decides — options in [[pick-up]].

## Skills for next session

- `/preset pick-up` / `catch-up` — session doors.
- `/preset ticket-loop` — re-seed via `/relay` when new tickets get
  `ready-for-agent` (exact command preserved in [[pick-up]]).
- `packages/tui:verify` — sandboxed CLI verification for TUI command-surface
  changes (used this session for the serve smoke test; note the real Bridge
  holds 41184 — sandbox config must set another `bridge.port`).

## Open questions

- **#145 "drip" RESOLVED as mostly-normal (#162):** the 2026-07-23 log's
  PARTIAL chain proved `read(n+1) = read(n) + creation(n)` exactly — the
  writes were banked, i.e. incremental caching working as designed, not a
  leak. The advisory was the problem; the growth tracker fixed the advisory.
  A future PARTIAL line (post-2.0.35) means a REAL stall — take those
  seriously, they carry `expected>=N` evidence now.

## Recent context

- **2026-07-23 bleed triage (this session):** user's serve log quantified the
  caching bleed — one codex-fallback cold MISS (274k creation, ~$5.50), three
  `system_changed` misses (~80k each, the #160 aux-fork variant shape), and
  the #145 drip. Fable cache math: read $1/M, 1h-TTL write $20/M — every
  re-written token costs ~20×. Biggest item was the fallback churn → #161.
- **Cooldown attribution caveat (known, accepted):** an advisor-reviewer error
  in `handleAnthropicMessages` records against the BASE route's provider id —
  worst case an inert cooldown on anthropic (the fallback guard makes
  anthropic-cooling a no-op). Rare path; revisit only if it bites.
- **Diagnosis chain landmines (still true):** key = model + FIRST user turn
  (+ tool names since #158); server diagnosis null ≠ healthy;
  `selectAnthropicBetas` gates are EXCLUSION lists; diagnosis token rides LAST.
- **Live-check technique:** scratchpad bun script importing core src with
  stored `~/.wisp/auth.json` creds; haiku's min cacheable prefix is 4096
  tokens — pad fillers past it.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[2026-07-23-usage-limit-cooldown-family-fallback-only]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
