---
name: slot
description: Use when a bridged Claude Code session needs a subagent on a Wisp Target the Agent tool cannot name (e.g. "run a subagent on gpt-5.6-sol"), when temporarily rebinding a family route for an agent, or when a stale ~/.claude/slot/lease.json blocks a rebind.
---

# Slot — rebind, spawn, restore

The Agent tool only accepts Claude family names (`haiku`, `sonnet`, `opus`, `fable`). The Wisp Bridge resolves those names through the Routing map on every request, so temporarily rebinding one family — the **Slot** — lets a subagent run on any Wisp Target. `wisp routing` provides the primitives; this skill is the safe procedure.

## The Iron Rule

**Never restore the Slot while any agent launched through it is still running.**

The Bridge re-reads the Routing map on every request. A running agent's next turn resolves the family again — restore early and that agent silently continues on the wrong backend. A returned task id proves launch, not completion. Hold the binding until every Slot-driven agent has finished.

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
- [ ] 7 Hold until ALL Slot agents finish
- [ ] 8 Guarded restore
- [ ] 9 Verify + delete lease
```

**1. Bridge check.** The session must point at the Bridge — `ANTHROPIC_BASE_URL` set to a local Bridge address. Probe it without the secret — any HTTP status proves a listener; refused/timeout means stop and ask the user to start the Bridge:

```
curl -s -o /dev/null -w "%{http_code}" "$ANTHROPIC_BASE_URL/v1/models"
```

**2. Lease check.** If `~/.claude/slot/lease.json` exists, STOP. Do not rebind, spawn, or overwrite. Surface its contents. Only after the user confirms no Slot-driven agent is still running: restore from the lease (step 8 semantics), verify, delete it — then start fresh.

**3. Snapshot + write lease.** Read `wisp routing --json`, extract the Slot family's current entry, and write `~/.claude/slot/lease.json` BEFORE any mutation:

```json
{ "slot": "haiku", "temporary": "codex/gpt-5.6-terra", "prior": "xai/grok-4.5" }
```

Use `"prior": "unset"` when the family has no route.

**4. Bind + verify.** Run `wisp routing set <slot> <providerId>/<model>`. Non-zero exit → re-read routing: Slot still equals prior → delete the unused lease and stop; anything else → surface the conflict, keep the lease. Zero exit → re-read and confirm the Slot now equals the temporary Target.

**5. Warning gate.** Any `warning:` line from `set` (missing key / signed out) goes to the user BEFORE spawning. Proceed only on their yes; otherwise restore immediately and delete the lease.

**6. Spawn.** Call the Agent tool with `model: "<slot family>"` — the family word. Never the Target string, never a Wisp Alias (Aliases do not exist in the Agent model surface). Label the agent with the real backend: set `description` to `<target model>: <short task>` (e.g. `gpt-5.6-sol: reply with one`) — the family word lies in the UI, the label is the only place the true model shows.

**7. Hold.** The binding stays until every agent launched through this lease has finished. Launch multiple agents only as one deliberate batch; restore waits for all of them.

**8. Guarded restore.** Re-read routing. Slot still equals the temporary Target → restore: prior Target → `wisp routing set <slot> <prior>`; prior `unset` → `wisp routing unset <slot>`. Slot changed by someone else → do NOT write; surface the conflict and keep the lease. (Read-then-write only — the CLI has no compare-and-set, so the guard is best-effort.)

**9. Verify + delete lease.** Re-read routing. Slot matches the saved prior state → delete `~/.claude/slot/lease.json`. Mismatch → keep the lease and report.

## Rationalizations — all wrong

| Excuse | Reality |
|---|---|
| "The binding only matters at spawn" | Every turn re-resolves the family. Early restore reroutes the live agent mid-task. |
| "The task id came back — restore now" | Task id = launched, not finished. Hold. |
| "Another terminal needs the family back" | Sacrifice a different family, or wait. Never restore under a live agent. |
| "The lease is stale and its process is dead — overwrite" | The lease is the only recovery record. Recover explicitly first. |
| "The warning is advisory and the deadline is now" | The user decides, before spawn — not you. |
| "Restore anyway, cleanup is my job" | A route someone else changed is newer state. Report, don't clobber. |

## Red flags — STOP

- Restoring before an agent's completion notification arrived
- Writing lease.json when one already exists
- Passing an Alias or `provider/model` string as the Agent model
- Spawning while a `warning:` line is unsurfaced
- Deleting a lease whose restore you did not verify

## Limits

- A crash or force-kill skips cleanup by design — the lease enables next-session recovery; nothing guarantees restore.
- One lease at a time; no concurrent independent Slots.
