---
type: active-work
project: wisp
updated: 2026-07-20
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-20 by Fable 5 (wrap-up)._
_At commit: db722a6 (v2.0.25 released) + this wrap-up commit._

## Current focus

**Nothing in flight.** v2.0.25 shipped and live on npm: the #139
Anthropic-door system-fold cache bust (the subscription-quota-spike bug) is
fixed and live-verified. The v2.0.24 chain (#127–#132) landed earlier the
same day; the relay chain at `.claude/relay/ticket-loop.md` is finished.

## State

- **In flight:** nothing. Ticket queue empty — no open `ready-for-agent` issues.
- **Done this session:**
  1. **#139 fixed** (issue → grilled design → TDD → PR #140 squash-merged →
     `v2.0.25` tagged, release green, npm live). Design recorded in
     [[2026-07-20-system-split-at-client-marker]]; mechanics live in code
     comments (bridgeAnthropic.ts parse, anthropic.ts build, bridgeServer.ts
     Anthropic arm, anthropicClient.ts threading). 575/575 tests (11 new).
  2. **Live-verified twice:** real `claude-wisp -p` run (3-block system,
     stable block byte-identical across requests, reads 55k+) and a synthetic
     kill-shot (volatile reminder changed between requests → read 9,385 /
     write 87; the old shape was read 0 / write 77k).
- **Blocked:** none.

## Pick up here

No queued task. Candidates, in rough value order:

1. **User-side:** stop `wisp.exe`, `npm i -g wisp-router` — the fix only
   protects sessions once the installed binary is 2.0.25.
2. **Small chore:** release workflow prints Node 20 deprecation warnings for
   `actions/checkout@v4` / `upload-artifact@v4` — bump action versions in
   `.github/workflows/release.yml` some idle moment.
3. New feature work → start at the funnel (`/preset init` or grill).

## Skills for next session

- `/preset catch-up` if the pick-up note is gone; otherwise the note is enough.

## Open questions

- None.

## Recent context

- Quota after the fix behaves like native Claude Code: advisor sub-calls
  still bill the whole transcript fresh per invocation (by design), and
  pinning cheap families to opus/fable-tier Targets still burns at the heavy
  model's rate — user-visible costs, not bugs.
- The new MISS guard logs `prompt-cache MISS … creation=…` in serve output if
  the bust shape ever returns; silence = healthy. Benign one-off triggers:
  1h-TTL expiry after idle, post-compaction.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
