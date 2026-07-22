---
type: pick-up
project: wisp
updated: 2026-07-22
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last leg (2026-07-22, relay leg 1): #158 shipped.** Diagnosis chain key now
distinguishes cache-prefix variants by tool lineup; landed on main `4123dc1`,
pushed, ticket closed. 634/634 tests + compile green.

**Next task: #159** (`ready-for-agent`, unblocked) — STALE cache-diagnosis
advisory overclaims "concurrent send" as the cause. Small change: the bridge's
STALE advisory log line asserts a specific cause it can't know; reword to
state what's actually known (bill contradicts the verdict → stale compare).
Likely file: `packages/core/src/bridgeServer.ts` (advisory line near the
diagnosis rendering, ~line 680) or the wording source in
`packages/core/src/anthropic.ts` — read ticket #159 body for the exact ask.

After #159: **#160** (investigate who drops the advisor field
mid-conversation; may produce no code — deliverable is a written cause +
follow-up ticket if wisp-side).

**The chain's vehicle — relay, one ticket per leg, gateless wrap-up per
slice** (state file `.claude/relay/ticket-loop.md`):

```
/relay N=1 /preset ticket-loop -> after the ticket's gate (tests green + landed, or ready-for-human relabel), run /preset wrap-up gateless: eyeball gate auto-go (unattended), /context-update, rewrite .context/pick-up.md to the next unblocked ready-for-agent ticket or "queue empty", commit .context on main — never the ticket branch. At leg boot also read .context/pick-up.md.
```

**Landmines:**

- Relay's leg boot reads `overview.md` + `active-work.md`, NOT this file —
  that's why the body ends with "at leg boot also read .context/pick-up.md".
- `/preset wrap-up`'s step 1 is a human eyeball gate (AskUserQuestion) — an
  unattended leg must treat it as auto-go, exactly as the body says.
- `.context/` commits go to main, never the ticket branch — otherwise the next
  leg (booting on main) reads a stale baton.
- #159 is small; repo rule says small diffs land straight on main (solo repo).
- #159 wording: don't assert "concurrent send" — the stale-compare detection
  (`anthropicDiagnosisStale`) only knows the bill contradicts the verdict,
  not why. Concurrency is one hypothesis, not the diagnosis.
- Details on the cache-fork mechanics:
  [[advisor-toggle-forks-the-cache-prefix-two-variants]].

## Related

- [[active-work]]
- [[overview]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
