---
type: pick-up
project: wisp
updated: 2026-07-22
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last session (2026-07-22): cache-log triage, no code.** Verdict: caching
healthy; an advisor on/off toggle mid-session forked the cache prefix (one real
~95K re-write + STALE advisory noise). Findings ticketed.

**Next task: work the three-ticket queue — #158, #159, #160** (all
`ready-for-agent`, independent, no blocking edges):

- **#158** — diagnosis chain key gets a tools-based variant discriminator.
- **#159** — STALE advisory wording stops asserting "concurrent send".
- **#160** — investigate who drops the advisor field mid-conversation.

**The user's chosen vehicle — relay, one ticket per leg, wrap-up per slice:**

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
- #158 constraint: leading system churn must NOT shift the chain key (existing
  test guards it) — discriminator from the tools list, never system content.
- #158/#159 are small; repo rule says small diffs land straight on main (solo
  repo). #160 may produce no code — its deliverable is a written cause +
  follow-up ticket if wisp-side.
- Details on the cache-fork mechanics:
  [[advisor-toggle-forks-the-cache-prefix-two-variants]].

## Related

- [[active-work]]
- [[overview]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
