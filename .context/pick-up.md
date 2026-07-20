---
type: pick-up
project: wisp
updated: 2026-07-20
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE): #139 quota-spike fix, released as v2.0.25.**

The Anthropic-door system-fold cache bust is fixed, live-verified, merged
(PR #140) and released — npm `wisp-router@2.0.25` live, release workflow
green. Design: split at the client's own `cache_control` marker; see
[[2026-07-20-system-split-at-client-marker]] and the code comments it points
at. Kill-shot proof: a changed volatile reminder now costs ~87 write tokens
instead of re-billing the whole ~77k prefix.

**Next task: none queued.** Ticket queue empty. Candidates:

1. Remind the user to reinstall if they haven't: stop `wisp.exe`, then
   `npm i -g wisp-router` (installed binary must be 2.0.25 for the fix to
   apply).
2. Idle chore: bump Node-20-deprecated actions in
   `.github/workflows/release.yml` (checkout@v4, upload-artifact@v4 warnings).
3. Otherwise: new work starts at the funnel (`/preset init` / grill).

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
