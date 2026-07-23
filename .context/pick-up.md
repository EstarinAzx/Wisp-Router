---
type: pick-up
project: wisp
updated: 2026-07-23
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last session (2026-07-23): #161 shipped + released as wisp-router 2.0.34.**
Bridge auto-cooldowns a provider on `429 usage_limit_reached` (parses
`resets_in_seconds`) and family-matched `claude-*` routes fall back to
anthropic until the window ends. feat 5bcff26, release 7b632d7, tag v2.0.34,
CI green (npm + GitHub release published). Design limits (in-memory only,
family-only fallback, usage-limit-only trigger):
[[2026-07-23-usage-limit-cooldown-family-fallback-only]].

**Next task: none queued.** `ready-for-agent` queue is empty. Open backlog:

- #69 — copilot-wisp launcher for the Copilot CLI (`enhancement`, needs
  grooming before it's agent-grabbable).
- #145 PARTIAL drip — unexplained ~4–10k/turn cache-creation behind a stable
  prefix; small leak. If the user wants it chased, first step is a fresh serve
  capture with the #156 server-diagnosis lines, then groom into a ticket.

When new work exists: label tickets `ready-for-agent`, then re-seed the
chain with the exact relay command below (state file
`.claude/relay/ticket-loop.md` has `stop: true`; re-running the command
re-inits it):

```
/relay N=1 /preset ticket-loop -> after the ticket's gate (tests green + landed, or ready-for-human relabel), run /preset wrap-up gateless: eyeball gate auto-go (unattended), /context-update, rewrite .context/pick-up.md to the next unblocked ready-for-agent ticket or 'queue empty', commit .context on main — never the ticket branch. At leg boot also read .context/pick-up.md.
```

**Landmines (for the next relay chain):**

- Relay's leg boot reads `overview.md` + `active-work.md`, NOT this file —
  that's why the body ends with "at leg boot also read .context/pick-up.md".
- `/preset wrap-up`'s step 1 is a human eyeball gate — an unattended leg must
  treat it as auto-go, exactly as the body says.
- `.context/` commits go to main, never a ticket branch — otherwise the next
  leg (booting on main) reads a stale baton.
- Relay spawns with `binary: claude` (native, NOT `claude-wisp`) — wisp legs
  die at boot when no Bridge runs at 127.0.0.1:41184. Keep the state file's
  `binary:` as-is.
- Body uses 'queue empty' in single quotes (double quotes shred the cmd
  spawn quoting); keep it that way when re-seeding.
- The user's running Bridge may still be pre-#161 code until they restart it
  — a codex 429 storm in a serve log is not evidence the fix failed; check
  the Bridge's boot time vs the 2.0.34 install first.

## Related

- [[active-work]]
- [[overview]]
- [[2026-07-23-usage-limit-cooldown-family-fallback-only]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
