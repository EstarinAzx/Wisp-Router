---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: e931080 (CI action bumps) + this wrap-up commit._

## Current focus

**Next up: #145 — Anthropic door cache re-bill amplifier.** Diagnosed this
session from transcript usage frames: bridged sessions re-bill the whole
conversation history at the stable-prefix boundary every ~7 requests (vs ~71
native) because the parse hoists mid-conversation `role:system` turns into the
#139 volatile suffix, which renders ahead of the entire message history. Cost:
0.6–1.2M wasted write-tokens per heavy session. Decision recorded in
[[2026-07-21-positioned-mid-conversation-system-matters]].

## State

- **In flight:** nothing — diagnosis done, tickets filed, no code started.
- **Queue:** two `ready-for-agent` issues:
  1. **#145** — preserve mid-conversation system turn position (parse keeps
     positioned turns; body builder emits at position — `role:system`
     passthrough if the OAuth wire takes the mid-conversation-system beta,
     else user-turn text block). FIRST STEP: capture one bridged request and
     confirm the churny blocks really arrive as `role:system` turns.
  2. **#146** — `anthropicCacheOutcome` gains a `partial` kind (read stalled
     at stable prefix + creation ≥ 4k floor) + advisory bridge log line; the
     current guard calls every fallback a `hit` and stays silent.
- **Done this session:**
  1. Chore: release.yml actions off Node 20 (checkout/setup-node v5,
     upload-artifact v6, download-artifact v7) — e931080, pushed.
  2. Cache forensics: per-session usage-frame analysis across 4 transcripts
     (2 wisp, 1 native, 1 mixed); wisp fallback rate 10× native; evidence
     tables live in #145.
  3. Confirmed user's installed binary is 2.0.28 (usage.iterations flowing,
     advisor consult visible in /cost).
- **Blocked:** none.

## Pick up here

Start #145 via the normal ticket flow (branch → TDD → PR). The verify-first
step is cheap: log one bridged request body (or add a temp dump in
`parseAnthropicMessagesRequest`) and check whether Claude Code's mid-session
reminders arrive as `role:"system"` turns vs top-level system churn. If they
turn out to be top-level only, #145's fix shape changes — re-read the issue
before coding. #146 is independent and small; good same-branch or follow-up.

## Skills for next session

- `/preset pick-up` — note points here.
- Ticket flow: `/preset ticket-loop` works (queue has 2 ready-for-agent).

## Open questions

- Does the Anthropic OAuth wire accept the mid-conversation-system beta
  (positioned `role:system` in `messages`)? Determines #145's emit shape.

## Recent context

- Analysis technique worth reusing: Claude Code transcript jsonl
  (`~/.claude/projects/<proj>/<session>.jsonl`) records per-request
  `cache_read/creation_input_tokens` — client-side cache forensics without
  touching serve logs. Dedup frames by `requestId`.
- Session fixed tax measured: 54–88k tokens cold-written per session start
  (system + tools + MCP instructions + skills); user-side ecosystem prune is
  a separate, non-wisp lever.
- Landmines (unchanged from #143): `usage.iterations` last entry = final base
  pass; reviewer usage never enters the `usage` event channel;
  `anthropicAttribution` samples the FIRST user message; max 4 cache_control
  markers, thinking blocks unmarkable (mark() slide).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
