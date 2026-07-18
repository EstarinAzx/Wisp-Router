---
name: slot
description: Use when a bridged Claude Code session needs a subagent on a Wisp Target the Agent tool cannot name (e.g. "run a subagent on gpt-5.6-sol"), when running subagents on several Wisp Targets at once (one family per distinct Target, up to 4 in parallel), when temporarily rebinding a family route for an agent, when the user asks for a plain family-route change (fast path — one command, no checklist), or when a stale ~/.claude/slot/lease-*.json blocks a rebind.
---

# Slot — rebind, spawn, restore

The Agent tool only accepts Claude family names (`haiku`, `sonnet`, `opus`, `fable`). The Wisp Bridge resolves those names through the Routing map on every request, so temporarily rebinding one family — the **Slot** — lets a subagent run on any Wisp Target. `wisp routing` provides the primitives; this skill is the safe procedure.

## Triage first — not every routing ask is a Slot

**The user asks only to change a route** ("route luna to haiku", "bind fable to grok", "point haiku at kimi") **and no subagent is to run on it** → that is a plain, persistent routing edit. Do this and stop:

```
wisp routing set <family> <providerId>/<model>
```

Surface any `warning:` line, re-read `wisp routing` to confirm, tell the user the prior value so they can revert. **No lease, no checklist, no restore** — the lease machinery exists to guarantee a *temporary* binding gets undone; a deliberate route change must persist.

The full procedure below applies only when a **subagent must run on a Target through a temporarily rebound family** — that is what needs snapshot/lease/hold/restore.

## The Iron Rule

**Never restore a family's Slot while any agent launched through that family is still running.**

The Bridge re-reads the Routing map on every request. A running agent's next turn resolves the family again — restore early and that agent silently continues on the wrong backend. A returned task id proves launch, not completion. Hold each family's binding until every agent launched through *that family* has finished. The rule is per-family: restoring `haiku` is safe while a `sonnet` agent still runs, because the two routes are independent.

## Inputs

- **Target** (required): `<providerId>/<model>`, e.g. `codex/gpt-5.6-terra`.
- **Slot family** (optional): `haiku` (default), or `sonnet` / `opus` / `fable` when the user names one.
- **Task**: what the subagent should do.

## Command availability

`wisp routing` needs wisp-router 2.0.11 or newer. If `wisp routing` opens the TUI instead of printing the map, the installed version is too old — stop and ask the user to upgrade:

```
npm install -g wisp-router@latest
```

## Procedure

Copy this checklist and check items off as you go:

```
Slot Progress:
- [ ] 1 Bridge check
- [ ] 2 Lease check
- [ ] 3 Snapshot + write lease
- [ ] 4 Bind + verify
- [ ] 5 Warning gate
- [ ] 6 Spawn via family
- [ ] 7 Hold each family until ITS agents finish
- [ ] 8 Guarded restore (per family)
- [ ] 9 Verify + delete lease (per family)
```

**1. Bridge check.** The session must point at the Bridge — `ANTHROPIC_BASE_URL` set to a local Bridge address. Probe it without the secret — any HTTP status proves a listener; refused/timeout means stop and ask the user to start the Bridge:

```
curl -s -o /dev/null -w "%{http_code}" "$ANTHROPIC_BASE_URL/v1/models"
```

**2. Lease check.** Leases are per-family: `~/.claude/slot/lease-<family>.json`. If the file for the family you intend to bind exists, STOP for *that family* — do not rebind, spawn, or overwrite it. Surface its contents. Only after the user confirms no agent on that family is still running: restore from the lease (step 8 semantics), verify, delete it — then start fresh. A lease for a *different* family (e.g. `lease-sonnet.json` when you want `haiku`) does not block you; leave it untouched.

**3. Snapshot + write lease.** Read `wisp routing --json`, extract the Slot family's current entry, and write `~/.claude/slot/lease-<family>.json` (e.g. `lease-haiku.json`) BEFORE any mutation:

```json
{ "slot": "haiku", "temporary": "codex/gpt-5.6-terra", "prior": "xai/grok-4.5" }
```

Use `"prior": "unset"` when the family has no route.

**4. Bind + verify.** Run `wisp routing set <slot> <providerId>/<model>`. Non-zero exit → re-read routing: Slot still equals prior → delete the unused lease and stop; anything else → surface the conflict, keep the lease. Zero exit → re-read and confirm the Slot now equals the temporary Target.

**5. Warning gate.** Any `warning:` line from `set` (missing key / signed out) goes to the user BEFORE spawning. Proceed only on their yes; otherwise restore immediately and delete the lease.

**6. Spawn.** Call the Agent tool with `model: "<slot family>"` — the family word. Never the Target string, never a Wisp Alias (Aliases do not exist in the Agent model surface). Label the agent with the real backend: set `description` to `<target model>: <short task>` (e.g. `gpt-5.6-sol: reply with one`) — the family word lies in the UI, the label is the only place the true model shows.

**7. Hold.** A family's binding stays until every agent launched through *that family* has finished. Agents on the same family share its Target — spawn as many as you like through one lease. Launching agents on other families in parallel is expected (see "Running Slots in parallel"), not a batch exception: each family's restore waits only for its own agents, so free a family the moment its agents complete rather than blocking on unrelated ones.

**8. Guarded restore.** Re-read routing. Slot still equals the temporary Target → restore: prior Target → `wisp routing set <slot> <prior>`; prior `unset` → `wisp routing unset <slot>`. Slot changed by someone else → do NOT write; surface the conflict and keep the lease. (Read-then-write only — the CLI has no compare-and-set, so the guard is best-effort.)

**9. Verify + delete lease.** Re-read routing. Slot matches the saved prior state → delete that family's `~/.claude/slot/lease-<family>.json`. Mismatch → keep the lease and report.

## Running Slots in parallel

Several subagents can run on different Wisp Targets at the same time. The routes
are independent, so each family is its own Slot with its own lease.

**Mapping.** One distinct Target needs one distinct family. Agents that should
run on the *same* Target share a single family (one lease, many agents). So:

- 3 agents, all on `codex/gpt-5.6-terra` → one family (`haiku`), one lease, spawn 3.
- 3 agents on 3 different Targets → three families (`haiku`, `sonnet`, `opus`),
  three leases, one each.

**Ceiling.** Only four family words exist (`haiku`, `sonnet`, `opus`, `fable`),
so **at most 4 distinct Targets run concurrently**. A 5th *distinct* Target at
the same instant is impossible — wait for one family to finish and restore
before binding its word to the fifth Target. (Reserve `fable` if the session's
own default model rides it.)

**Procedure.** Run steps 2–5 once **per family** (each writes its own
`lease-<family>.json`), then spawn every agent in a single Agent batch (step 6,
each with its own family word). Hold per step 7, and run steps 8–9 for each
family independently — restore and delete a family's lease as soon as its own
agents finish, without waiting on the others.

## Rationalizations — all wrong

| Excuse | Reality |
|---|---|
| "The binding only matters at spawn" | Every turn re-resolves the family. Early restore reroutes the live agent mid-task. |
| "The task id came back — restore now" | Task id = launched, not finished. Hold. |
| "Another terminal needs the family back" | Sacrifice a different family, or wait. Never restore under a live agent. |
| "Family A's agents are done but B's still run — hold everything until all finish" | Restore is per-family. Free A now; A's lease and B's are independent. |
| "Five different Targets at once — bind a family twice" | A family holds one Target at a time. Four Targets max concurrently; queue the fifth. |
| "The lease is stale and its process is dead — overwrite" | The lease is the only recovery record. Recover explicitly first. |
| "The warning is advisory and the deadline is now" | The user decides, before spawn — not you. |
| "Restore anyway, cleanup is my job" | A route someone else changed is newer state. Report, don't clobber. |
| "User asked to rebind a family — run the full dance" | No subagent to run = plain routing edit. One `set`, no lease, no checklist. |

## Red flags — STOP

- Restoring before an agent's completion notification arrived
- Writing a family's `lease-<family>.json` when one already exists for that family
- Binding a family whose lease-file already exists (its route may still be rebound)
- Passing an Alias or `provider/model` string as the Agent model
- Spawning while a `warning:` line is unsurfaced
- Deleting a lease whose restore you did not verify

## Limits

- A crash or force-kill skips cleanup by design — a per-family lease enables next-session recovery; nothing guarantees restore.
- Up to 4 concurrent Slots — one per family word (`haiku`/`sonnet`/`opus`/`fable`). A distinct Target needs a distinct family, and all agents on one family share its Target. More than 4 distinct Targets at once is impossible; free a family before binding a fifth Target. No queue is built for that case.
