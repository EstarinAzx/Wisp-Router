---
type: active-work
project: wisp
updated: 2026-07-19
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-19 18:xx by Opus 4.8 (1M) (wrap-up)._
_At commit: fc355e6 (release 2.0.21 + context)._

## Current focus

**Nothing code-pending — drive normal.** Native Advisor through the Bridge is merged and
**2.0.21 is live** (npm `wisp-router@2.0.21` + GitHub release `v2.0.21`, release.yml green). The
user confirmed it live in a real `claude-wisp` session: Opus 4.8 advised, round-trip reached the
full conversation.

## State

- **In flight:** none.
- **Done this session:** shipped the Wisp-native Advisor (Stages 0–4 of
  [[2026-07-19-wisp-native-advisor-via-door-server-tool]]). The Anthropic door now plays the
  advisor server-tool role — forwards a synthetic `advisor` tool to the base Target, runs a
  separate reviewer pass when called (advisor model routed through the Routing map, any Target
  advising any other), streams `server_tool_use` + `advisor_tool_result` back for the native UI,
  and resumes the base turn with the advice. `advisorToolSpec` + `runAdvisorLoop` are pure +
  unit-tested (`bridgeAnthropic.ts`); the door wiring is in `bridgeServer.ts`. The launcher +
  setup snippets set `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1` (the client-side prereq).
  Stale `/bridge` + vscode "endpoint-gated, use native claude" warning removed. Merged
  `claude/wisp-native-advisor` → main `--no-ff`, cut release 2.0.21 (`ef6726a`: package.json +
  CHANGELOG + span-baseline `--update`), tag `v2.0.21`. Also merged the pushed
  `claude/repo-context-rehydrate-r1w1yw` context branch first (`dc7be49`).
- **Verified:** 532 core tests · core `tsc` · tui `tsc` · vscode compile all clean; release run
  29675147778 all-green; live-verified on isolated port 41185 (kimi base + opus reviewer,
  cross-provider) AND in the user's real session.
- **Blocked:** none.

## Pick up here

No active work — pick a new task. Housekeeping: the merged `claude/wisp-native-advisor` local
branch is already deleted; its remote (and the older `claude/anthropic-cache-ttl-fix`,
`claude/repo-context-rehydrate-r1w1yw`) can be pruned on GitHub whenever.

## Skills for next session

_None clearly apply — new task will pick its own route._

## Open questions

- Advisor reviewer prompt (`REVIEWER_SYSTEM` in `bridgeServer.ts`) is a first cut — tune if the
  advice reads generic. `maxConsults` caps advisor rounds at 4/turn (ponytail default).
- Optional openclaude cache steal #3 (`skipCacheWrite` for forks) still parked.

## Recent context

- The advisor was NEVER endpoint-gated — Stage 0 (from the real `claude` 2.1.215 binary) proved a
  wisp session is `firstParty`. The only missing piece was Wisp playing the server role.
- Live prereq that bit the user first: a `claude-wisp-*` base model has no `advisor_rank`, so
  Claude Code only injects the advisor tool under `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1`
  — otherwise the model reports "advisor tool not there." Launcher sets it now.
- "test advisor" on an empty session may legitimately not fire (the model decides when to consult).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-19-wisp-native-advisor-via-door-server-tool]]
- [[claude-code-advisor-is-endpoint-gated-past-the-bridge]]
