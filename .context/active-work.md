---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: cca576c (v2.0.28 released) + this wrap-up commit._

## Current focus

**Nothing in flight.** v2.0.28 shipped and live on npm: #143 advisor reviewer
token usage now surfaces to Claude Code as `usage.iterations`
(`advisor_message` entries + final base pass last), so `/cost` and session
totals include advisor consults. The advisor saga is closed: quarantine
(2.0.26) → cacheable transcript (2.0.27) → visible cost (2.0.28).

## State

- **In flight:** nothing. Ticket queue empty — no open `ready-for-agent` issues.
- **Done this session:**
  1. **#143 shipped** (grilled design → TDD → PR #144 squash-merged →
     `v2.0.28` tagged, release green, npm live). Design recorded in
     [[2026-07-21-advisor-usage-iterations-shape]]; mechanics in code comments
     (bridgeAnthropic.ts `usageIterations` + `runAdvisorLoop`, bridgeServer.ts
     reviewer). 586/586 tests (7 new).
  2. **Live-verified:** headless source serve + real `claude-wisp -p` forcing
     one advisor consult — Claude Code folded advisor tokens into `modelUsage`
     (450 output = 445 advisor + 5 base) and `total_cost_usd`; serve log clean,
     no cache-MISS line.
- **Blocked:** none.

## Pick up here

No queued task. Candidates, in rough value order:

1. **User-side:** stop `wisp.exe` (already stopped as of this session's end),
   `npm i -g wisp-router` → 2.0.28. Advisor cost visibility only applies once
   the installed binary is current.
2. **Small chore:** bump Node-20-deprecated actions in
   `.github/workflows/release.yml` (`actions/checkout@v4`,
   `upload-artifact@v4` — warnings on every release run).
3. New feature work → start at the funnel (`/preset init` or grill).

## Skills for next session

- `/preset catch-up` if the pick-up note is gone; otherwise the note is enough.

## Open questions

- None.

## Recent context

- openclaude parse facts pinned during #143 (worth remembering for any future
  usage-shaping work): `getAdvisorUsage` filters `iterations` by
  `type === 'advisor_message'`; `iterations[-1]` is the authoritative final
  context window; streaming merge keeps the most recent frame's `iterations`;
  unknown model ids price at `DEFAULT_UNKNOWN_MODEL_COST` + flag.
- Advisor billing that is BY DESIGN (not bugs): each consult bills the
  conversation fresh (cached where possible); cheap families pinned to heavy
  Targets burn at the heavy rate.
- The #111 MISS guard still logs `prompt-cache MISS … creation=…` in serve
  output if the bust shape returns; silence = healthy.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
