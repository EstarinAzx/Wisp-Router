---
type: active-work
project: wisp
updated: 2026-07-22
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-22 by Fable 5 (relay leg 3 wrap-up)._
_At commit: 76e4fba (#159 fix on main) — leg 3 shipped no code, only this write-up._

## Current focus

**Cache-triage queue COMPLETE.** #158 (leg 1), #159 (leg 2), #160 (leg 3) all
closed. The relay chain stopped itself — queue empty.

## State

- **In flight:** nothing. Working tree clean on main.
- **Done this leg:** **#160 closed** — investigation, no code. Cause of the
  advisor-field drops: Claude Code's auxiliary fork queries (auto-memory
  extraction `querySource:"extract_memories"`, compact, agent_summary) fork
  the main conversation but the `advisor_20260301` tool is injected only for
  querySources `repl_main_thread*`/`agent:*`/`sdk`/`hook_agent` — aux classes
  never carry it, so with advisor on every aux fork is a second prefix
  variant (first fork = ~95k uncached re-write, `skipTranscript` hides its
  usage from transcripts, `skipCacheWrite` mitigation feature-gated off
  upstream). Not a user toggle, not a wisp bug — full evidence chain in the
  [#160 comment](https://github.com/EstarinAzx/Wisp-Router/issues/160).
  Gotcha [[advisor-toggle-forks-the-cache-prefix-two-variants]] rewritten to
  name the real actor. No follow-up ticket — nothing wisp-side to fix.
- **Queue:** empty. Only open issue is #69 (backlog: copilot-wisp launcher,
  `enhancement`, not `ready-for-agent`).
- **Blocked:** nothing.

## Pick up here

No queued agent work. Next session: user decides — options in [[pick-up]].

## Skills for next session

- `/preset pick-up` / `catch-up` — session doors.
- `/preset ticket-loop` — re-seed via `/relay` when new tickets get
  `ready-for-agent` (exact command preserved in [[pick-up]]).
- `packages/tui:verify` — sandboxed CLI verification for TUI command-surface changes.

## Open questions

- none from the cache-triage arc. (#160's question answered on the ticket.)

## Recent context

- **#160 evidence technique (this leg):** the flap session's raw serve logs
  were gone, but the triage session's transcript (`b9bdba5c`) preserved the
  pasted log block; the flap session itself (`ece6d83f`) was located by
  grepping all project transcripts for the exact `cache_read` values in the
  STALE lines; the mechanism came from string-grepping the compiled Claude
  Code binary (`~/.local/share/claude/versions/2.1.217` — minified JS is
  greppable with `grep -a`). Absence of `creation=95299` from every JSONL was
  itself evidence (`skipTranscript`).
- **Advisor-flap cache economics:** two warm variants, money leaks at growth
  spurts only — details + recognition marks now live in the gotcha
  [[advisor-toggle-forks-the-cache-prefix-two-variants]].
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
