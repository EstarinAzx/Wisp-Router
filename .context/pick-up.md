---
type: pick-up
project: wisp
updated: 2026-07-20
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last tasks (DONE): #139 quota-spike fix (v2.0.25) + #142 hotfix (v2.0.26).**

- #139: Anthropic-door system-fold cache bust fixed, live-verified (kill-shot:
  volatile change = 87 write tokens vs old full ~77k re-bill), PR #140. See
  [[2026-07-20-system-split-at-client-marker]].
- #142: same-day regression — the advisor reviewer inherited `systemSplit`
  and lost its quarantine frame; fixed via pure `buildReviewerRequest`
  (bridgeAnthropic.ts), released v2.0.26. npm live at 2.0.26.

**Next task: #141 (queued, needs grill).** Advisor reviewer re-bills the whole
transcript per invocation — split the serialized review transcript into
per-turn blocks so call 2+ reads cache (openclaude learning; same physics as
#139). Design NOT grilled — grill marker placement + deterministic
RESULT_CAP truncation + whether to also surface reviewer usage to the client,
before coding. Not urgent: advisor is opt-in, a handful of calls per session.

Other candidates:

1. Remind the user to reinstall if they haven't: stop `wisp.exe`, then
   `npm i -g wisp-router` (fix only applies once installed binary ≥ 2.0.26).
2. Idle chore: bump Node-20-deprecated actions in
   `.github/workflows/release.yml` (checkout@v4, upload-artifact@v4 warnings).

**Landmines:**

- `anthropicAttribution` fingerprint samples the FIRST user message —
  server-validated; don't change what text feeds it.
- Max 4 `cache_control` markers per request; thinking blocks unmarkable; the
  mark() slide logic in anthropic.ts handles both — don't break.
- If quota spikes return: watch serve output for the new
  `prompt-cache MISS … creation=…` line (guard now catches the
  creation-shaped bust). Benign one-offs: 1h-TTL expiry, post-compaction.

## Related

- [[active-work]]
- [[overview]]
