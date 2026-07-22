---
type: pick-up
project: wisp
updated: 2026-07-22
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last leg (2026-07-22, relay leg 3): #160 closed — queue empty, relay chain
stopped itself.** The advisor-field drops were Claude Code's auxiliary fork
queries (auto-memory extraction et al.) which never carry the advisor tool —
inherent upstream behavior, not a user toggle, not a wisp bug. No code
changed; the deliverable is the evidence write-up on
[#160](https://github.com/EstarinAzx/Wisp-Router/issues/160) and the
rewritten gotcha [[advisor-toggle-forks-the-cache-prefix-two-variants]].
The whole cache-triage arc (#158 chain-key, #159 STALE wording, #160
investigation) is done.

**Next task: none queued.** `ready-for-agent` queue is empty. Open backlog:
- #69 — copilot-wisp launcher for the Copilot CLI (`enhancement`, needs
  grooming before it's agent-grabbable).

When new work exists: label tickets `ready-for-agent`, then re-seed the
chain with the exact relay command below (state file
`.claude/relay/ticket-loop.md` now has `stop: true`; re-running the command
re-inits it):

```
/relay N=1 /preset ticket-loop -> after the ticket's gate (tests green + landed, or ready-for-human relabel), run /preset wrap-up gateless: eyeball gate auto-go (unattended), /context-update, rewrite .context/pick-up.md to the next unblocked ready-for-agent ticket or 'queue empty', commit .context on main — never the ticket branch. At leg boot also read .context/pick-up.md.
```

**Landmines (for the next relay chain):**

- Relay's leg boot reads `overview.md` + `active-work.md`, NOT this file —
  that's why the body ends with "at leg boot also read .context/pick-up.md".
- `/preset wrap-up`'s step 1 is a human eyeball gate (AskUserQuestion) — an
  unattended leg must treat it as auto-go, exactly as the body says.
- `.context/` commits go to main, never a ticket branch — otherwise the next
  leg (booting on main) reads a stale baton.
- Relay spawns with `binary: claude` (native, NOT `claude-wisp`) — wisp legs
  die at boot when no Bridge runs at 127.0.0.1:41184. Keep the state file's
  `binary:` as-is.
- Body uses 'queue empty' in single quotes (double quotes shred the cmd
  spawn quoting); keep it that way when re-seeding.

## Related

- [[active-work]]
- [[overview]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
