---
type: pick-up
project: wisp
updated: 2026-07-20
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last tasks (DONE): #139 (v2.0.25) → #142 hotfix (v2.0.26) → #141 (v2.0.27).**

- #139: Anthropic-door system-fold cache bust fixed, live-verified (kill-shot:
  volatile change = 87 write tokens vs old full ~77k re-bill), PR #140. See
  [[2026-07-20-system-split-at-client-marker]].
- #142: same-day regression — the advisor reviewer inherited `systemSplit`
  and lost its quarantine frame; fixed via pure `buildReviewerRequest`.
- #141: advisor reviewer transcript now rides as per-turn `textBlocks`
  (grilled 2026-07-21: seam mirrors systemSplit — `text` stays the full join
  for non-Anthropic Targets; existing marker walk does placement; unit-tested,
  no live repro — #139's kill-shot proved the physics). npm live at 2.0.27.

**Next task: none urgent.** Candidates:

1. Remind the user to reinstall if they haven't: stop `wisp.exe`, then
   `npm i -g wisp-router` (needs ≥ 2.0.26 for the quota fixes; 2.0.27 adds
   the advisor cache win).
2. **#143** (queued, needs design + live capture): surface advisor reviewer
   token usage to the client (`usage.iterations` `advisor_message` shape) —
   verify how Claude Code renders door-emitted iterations before picking the
   wire shape.
3. Idle chore: bump Node-20-deprecated actions in
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
