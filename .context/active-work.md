---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: c385c04 (v2.0.29 release) + this wrap-up commit._

## Current focus

**Nothing in flight — v2.0.29 shipped and installed.** The cache re-bill
amplifier (#145) and the silent cache guard (#146) are fixed, merged via PR
#147 (squash `fbcfd96`), released as **wisp-router 2.0.29** (workflow green —
first run on the bumped action versions, all fine), and the dev machine's
global install is updated + smoke-tested.

## State

- **In flight:** nothing.
- **Queue:** no `ready-for-agent` tickets. Open issues: #126 (2.0.24 spec
  umbrella — content long shipped, probably closable) and #69 (backlog:
  copilot-wisp launcher).
- **Done this session:**
  1. **#145 verified then fixed.** Live capture (dummy `ANTHROPIC_BASE_URL`
     listener + nested `claude -p` two-turn) confirmed Claude Code sends hook
     reminders as mid-conversation `role:"system"` turns and that claude CLI
     natively advertises `mid-conversation-system-2026-04-07` and marks
     `cache_control` on text blocks INSIDE system turns. Fix: parse keeps
     positioned `role:'system'` turns; builder lifts at most ONE leading
     system message and emits positioned turns as single-text-block system
     messages; client advertises the beta. Evidence + emit decision posted as
     a comment on #145.
  2. **#146 fixed.** `anthropicCacheOutcome` gains `partial` (read>0 ∧
     creation≥4k ∧ ≥3 non-system turns) + advisory `PARTIAL` bridge log line.
  3. **Review pass caught 4 regressions pre-merge** (cavecrew-reviewer):
     second-leading-system hoist would resurrect the amplifier; attribution
     had to sample the first USER turn; all-system body now 400s; cache-gate
     turn count excludes system turns.
  4. **Released v2.0.29** (tag → release.yml → npm) and updated the global
     install; sandboxed `wisp routing` smoke passed.
- **Blocked:** none.

## Pick up here

No queued task. Candidates, in rough order of value:

1. **Verification spot check (5 min, after the user's next heavy bridged
   session):** transcript-forensics the session jsonl — expect the
   whole-history fallback rate near native (~1/70 requests, was ~1/7), and
   serve-log `PARTIAL` lines only as rare singletons (bursts = something's
   wrong).
2. Close #126 if the user agrees it's fully shipped.
3. User-side (non-wisp) lever: 54–88k token session-start cold write from
   the hook/skill/MCP roster — an ecosystem prune, route via `/preset health`.

## Skills for next session

- `/preset pick-up` — note points here.
- `packages/tui:verify` — project skill for sandboxed CLI verification
  (discovered this session; use for any TUI command-surface change).

## Open questions

- None for the wisp codebase. (The mid-conversation-system beta question is
  answered: the OAuth wire takes positioned `role:system` — claude CLI sends
  it natively.)

## Recent context

- **Capture technique worth reusing:** point `ANTHROPIC_BASE_URL` at a tiny
  local listener that dumps request bodies (never headers — bearer rides
  there) and answers canned SSE; run `claude -p` / `claude -p -c` for
  one/two-turn wire captures. Zero API cost, exact wire shapes.
- Transcript jsonl forensics (per-request `cache_read/creation_input_tokens`,
  dedup by `requestId`) remains the client-side cache audit tool.
- Landmines (still true): `anthropicAttribution` samples the FIRST user
  message; max 4 `cache_control` markers, thinking blocks unmarkable (mark()
  slide); `usage.iterations` last entry = final base pass; builder hoists at
  most ONE leading system message (a second leading one is positioned — see
  #145 review fix).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
