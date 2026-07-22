---
type: pick-up
project: wisp
updated: 2026-07-22
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last leg (2026-07-22, relay leg 2): #159 shipped.** STALE cache-diagnosis
advisory in `packages/core/src/bridgeServer.ts` (~line 682) no longer asserts
"concurrent send" as the cause — it states the bill-contradicts-verdict
observable and names both known shapes (concurrent send, prefix-variant
flip). Landed on main `76e4fba`, pushed, ticket closed. 634/634 + compile
green.

**Next task: #160** (`ready-for-agent`, unblocked, LAST queue item) —
Investigate: advisor field drops mid-conversation (prefix flip, ~95k cache
re-write). **Investigation, not a code change.** A bridged session shows one
conversation alternating between carrying the advisor field and not; each
flip forks the cached prefix (first flip ≈95k-token full-prefix re-write,
flapping double-bills history deltas). Find who drops the field:

- user toggling Advisor mid-session (benign — document and close), vs
- picker/panel state flapping (wisp bug — file a fix ticket), vs
- a Claude Code request class that never carries the field (clue: lone
  `effort=high` request inside the no-advisor cluster while surrounding
  main-loop requests ran `effort=xhigh`).

Deliverable per acceptance criteria: written cause on the ticket (repro
steps or ruled-out list with evidence); wisp-side bug → follow-up fix
ticket; inherent → document a flip's expected cost so log readers recognize
the shape. Possibly no code.

After #160: **queue empty** — ticket-loop signals stop; relay sets
`stop: true`, no further legs.

**The chain's vehicle — relay, one ticket per leg, gateless wrap-up per
slice** (state file `.claude/relay/ticket-loop.md`):

```
/relay N=1 /preset ticket-loop -> after the ticket's gate (tests green + landed, or ready-for-human relabel), run /preset wrap-up gateless: eyeball gate auto-go (unattended), /context-update, rewrite .context/pick-up.md to the next unblocked ready-for-agent ticket or 'queue empty', commit .context on main — never the ticket branch. At leg boot also read .context/pick-up.md.
```

**Landmines:**

- Relay's leg boot reads `overview.md` + `active-work.md`, NOT this file —
  that's why the body ends with "at leg boot also read .context/pick-up.md".
- `/preset wrap-up`'s step 1 is a human eyeball gate (AskUserQuestion) — an
  unattended leg must treat it as auto-go, exactly as the body says.
- `.context/` commits go to main, never a ticket branch — otherwise the next
  leg (booting on main) reads a stale baton.
- Relay spawns with `binary: claude` (native, NOT `claude-wisp`) — wisp legs
  die at boot when no Bridge runs at 127.0.0.1:41184. Keep the state file's
  `binary:` as-is.
- #160 is an investigation ticket: closing it with a documented benign cause
  and no diff is a valid gate pass ("landed" = the write-up comment). If it
  turns ambiguous or needs a human decision, relabel `ready-for-human`.
- Where to look: advisor field enters the Bridge request path in
  `packages/core/src/bridgeServer.ts` (advisorTools substitution upstream of
  the Anthropic arm's chain call site — see #158's mechanics in
  [[active-work]]); cache-fork economics in
  [[advisor-toggle-forks-the-cache-prefix-two-variants]].

## Related

- [[active-work]]
- [[overview]]
- [[advisor-toggle-forks-the-cache-prefix-two-variants]]
