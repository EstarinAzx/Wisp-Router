---
type: pick-up
project: wisp
updated: 2026-07-19
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE, shipped):** Wisp-native Advisor — the Anthropic door now plays the advisor
server-tool role so Claude Code's `/advisor` works through the Bridge. Shipped
`wisp-router@2.0.21` (npm + GitHub release, release.yml green), live-verified in the user's real
session (Opus 4.8 advised, full round-trip). Details in
[[2026-07-19-wisp-native-advisor-via-door-server-tool]].

**Next task:** none queued — pick a new one, or drive normal. Nothing code-pending.

**If advisor comes up again:**
- Core: `advisorToolSpec` + `runAdvisorLoop` in `packages/core/src/bridgeAnthropic.ts` (pure,
  unit-tested); door wiring + `REVIEWER_SYSTEM` in `packages/core/src/bridgeServer.ts`.
- Live prereq: `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1` (launcher sets it) or a
  `claude-wisp-*` base model reports "advisor tool not there."
- `REVIEWER_SYSTEM` prompt + `maxConsults` (4/turn) are the knobs if behavior needs tuning.

**Landmine:** don't remove the #111 cache breakpoints and don't re-derive the Anthropic cache TTL
from `convo.length` (see [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]).

## Related

- [[active-work]]
- [[overview]]
- [[2026-07-19-wisp-native-advisor-via-door-server-tool]]
