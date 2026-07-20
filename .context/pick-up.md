---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE): #143 (v2.0.28) — advisor cost visible to Claude Code.**

- Advisor reviewer usage now rides as `usage.iterations` on the door's closing
  usage frame: `advisor_message` entries (resolved Target model + tokens),
  final base pass last. Grilled design in
  [[2026-07-21-advisor-usage-iterations-shape]]; PR #144, live-verified
  (Claude Code folded advisor tokens into `modelUsage` + `total_cost_usd`).
- Advisor saga now fully closed: 2.0.26 quarantine → 2.0.27 cacheable
  transcript → 2.0.28 visible cost.

**Next task: none urgent.** Candidates:

1. Remind the user to reinstall if they haven't: `wisp.exe` was left STOPPED
   this session; `npm i -g wisp-router` → 2.0.28, then restart serve.
2. Idle chore: bump Node-20-deprecated actions in
   `.github/workflows/release.yml` (checkout@v4, upload-artifact@v4 warnings
   on every release).
3. New feature work → funnel (`/preset init` or grill).

**Landmines:**

- `usage.iterations` last entry MUST stay the final base pass — Claude Code
  reads `iterations[-1]` as the authoritative context window; an advisor entry
  there corrupts window math. Encoded in `usageIterations()` +
  bridgeAnthropic tests; don't "simplify" it away.
- Reviewer usage must never enter the `usage` event channel — top-level usage
  + the #111 `anthropicCacheOutcome` guard read the base pass only.
- `anthropicAttribution` fingerprint samples the FIRST user message —
  server-validated; don't change what text feeds it.
- Max 4 `cache_control` markers per request; thinking blocks unmarkable; the
  mark() slide logic in anthropic.ts handles both — don't break.

## Related

- [[active-work]]
- [[overview]]
