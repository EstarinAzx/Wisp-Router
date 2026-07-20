---
name: slot
description: Use when a bridged Claude Code session needs a subagent on a Wisp Target the Agent tool cannot name (e.g. "run a subagent on gpt-5.6-sol"), when running subagents on several Wisp Targets at once (one family per distinct Target, up to 4 in parallel), when temporarily rebinding a family route for an agent, when the user asks for a plain family-route change (fast path — one command, no checklist), or when a held row Snapshot blocks a rebind (wisp snapshot reports the row already snapshotted).
---

# Slot — rebind, spawn, restore

The Agent tool only accepts Claude family names (`haiku`, `sonnet`, `opus`, `fable`). The Wisp Bridge resolves those names through the Routing map on every request, so temporarily rebinding one family — the **Slot** — lets a subagent run on any Wisp Target. `wisp snapshot` + `wisp snapshot revert` provide the primitives; this skill is the safe procedure.

## Triage first — not every routing ask is a Slot

**The user asks only to change a route** ("route luna to haiku", "bind fable to grok", "point haiku at kimi") **and no subagent is to run on it** → that is a plain, persistent routing edit. Do this and stop:

```
wisp routing set <family> <providerId>/<model>
```

Surface any `warning:` line, re-read `wisp routing` to confirm, tell the user the prior value so they can revert. **No snapshot, no checklist, no restore** — the snapshot machinery exists to guarantee a *temporary* binding gets undone; a deliberate route change must persist.

The full procedure below applies only when a **subagent must run on a Target through a temporarily rebound family** — that is what needs snapshot/hold/revert.

## The Iron Rule

**Never restore a family's Slot while any agent launched through that family is still running.**

The Bridge re-reads the Routing map on every request. A running agent's next turn resolves the family again — restore early and that agent silently continues on the wrong backend. A returned task id proves launch, not completion. Hold each family's binding until every agent launched through *that family* has finished. The rule is per-family: restoring `haiku` is safe while a `sonnet` agent still runs, because the two routes are independent.

## Inputs

- **Target** (required): `<providerId>/<model>`, e.g. `codex/gpt-5.6-terra`.
- **Slot family** (optional): `haiku` (default), or `sonnet` / `opus` / `fable` when the user names one.
- **Task**: what the subagent should do.

## Command availability

`wisp snapshot` needs wisp-router 2.0.24 or newer. If `wisp snapshot` prints usage only, errors `not snapshotted` on a row you never snapshotted, or opens the TUI instead of printing lines, the installed version is too old — stop and ask the user to upgrade:

```
npm install -g wisp-router@latest
```

## Procedure

Work through these seven steps in order, but **track them silently** — do not print the checklist or tick boxes in the transcript. Surface only what the user must see or act on: any `warning:` line (step 5), each agent spawn (naming its real backend), and each restore. Track your own progress with the harness task tools if you like, but keep the step-by-step out of the output.

1 Bridge check · 2 Snapshot the row · 3 Bind + verify · 4 Warning gate · 5 Spawn via family · 6 Hold each family until its agents finish · 7 Revert the row (per family)

**1. Bridge check.** The session must point at the Bridge — `ANTHROPIC_BASE_URL` set to a local Bridge address. Probe it without the secret — any HTTP status proves a listener; refused/timeout means stop and ask the user to start the Bridge:

```
curl -s -o /dev/null -w "%{http_code}" "$ANTHROPIC_BASE_URL/v1/models"
```

**2. Snapshot the row.** Run `wisp snapshot <slot-family>` BEFORE any mutation. It records the family's current Target into the snapshot store (`snapshot haiku = xai/grok-4.5`, or `= unset`). If it instead prints `error: '<family>' already snapshotted (<value>)` → STOP for *that family*: a previous Slot on that family never reverted (or a snapshot is held for another reason). Do not rebind or spawn. Surface the held value. Only after the user confirms no agent on that family is still running: `wisp snapshot revert <slot-family>` to restore and clear it — then snapshot again fresh. A snapshot held on a *different* row (e.g. `sonnet` held when you want `haiku`) does not block you; leave it untouched.

**3. Bind + verify.** Run `wisp routing set <slot> <providerId>/<model>`. Non-zero exit → re-read routing: Slot still equals the snapshotted value → `wisp snapshot revert <slot>` to drop the unused snapshot and stop; anything else → surface the conflict and keep the snapshot held. Zero exit → re-read and confirm the Slot now equals the temporary Target.

**4. Warning gate.** Any `warning:` line from `set` (missing key / signed out) goes to the user BEFORE spawning. Proceed only on their yes; otherwise `wisp snapshot revert <slot>` immediately.

**5. Spawn.** Call the Agent tool with `model: "<slot family>"` — the family word. Never the Target string, never a Wisp Alias (Aliases do not exist in the Agent model surface). Label the agent with the real backend: set `description` to `<target model>: <short task>` (e.g. `gpt-5.6-sol: reply with one`) — the family word lies in the UI, the label is the only place the true model shows.

**6. Hold.** A family's binding stays until every agent launched through *that family* has finished. Agents on the same family share its Target — spawn as many as you like through one snapshot. Launching agents on other families in parallel is expected (see "Running Slots in parallel"), not a batch exception: each family's revert waits only for its own agents, so free a family the moment its agents complete rather than blocking on unrelated ones.

**7. Revert the row (per family).** Run `wisp snapshot revert <slot-family>`. It writes the recorded value back over the live one, prints the overwritten value (`revert haiku -> xai/grok-4.5 (was codex/gpt-5.6-terra)`), and clears the snapshot. Surface that line — it shows the user exactly what changed. If it errors `'<family>' is not snapshotted.` someone already reverted; re-read `wisp routing` and report the live value rather than guessing. (Revert is unconditional — it overwrites whatever the row currently holds, with no compare-and-set guard.)

## Running Slots in parallel

Several subagents can run on different Wisp Targets at the same time. The routes
are independent, so each family is its own Slot with its own snapshot.

**Mapping.** One distinct Target needs one distinct family. Agents that should
run on the *same* Target share a single family (one snapshot, many agents). So:

- 3 agents, all on `codex/gpt-5.6-terra` → one family (`haiku`), one snapshot, spawn 3.
- 3 agents on 3 different Targets → three families (`haiku`, `sonnet`, `opus`),
  three snapshots, one each.

**Ceiling.** Only four family words exist (`haiku`, `sonnet`, `opus`, `fable`),
so **at most 4 distinct Targets run concurrently**. A 5th *distinct* Target at
the same instant is impossible — wait for one family to finish and revert
before binding its word to the fifth Target. (Reserve `fable` if the session's
own default model rides it.)

**Procedure.** Run steps 2–4 once **per family** (each snapshots its own row),
then spawn every agent in a single Agent batch (step 5, each with its own
family word). Hold per step 6, and run step 7 for each family independently —
revert a family's row as soon as its own agents finish, without waiting on the
others.

## Recovery after a crash

A crash or force-kill can leave a family rebound with its snapshot still held — the snapshot store survives the session, unlike the agent. On the next session the SessionStart hook warns about any held rows. Recover each: confirm no agent on that family is still running, then `wisp snapshot revert <family>`. The held snapshot is the only recovery record — never hand-edit the store or `wisp routing set` over it without reverting first.

## Rationalizations — all wrong

| Excuse | Reality |
|---|---|
| "The binding only matters at spawn" | Every turn re-resolves the family. Early revert reroutes the live agent mid-task. |
| "The task id came back — restore now" | Task id = launched, not finished. Hold. |
| "Another terminal needs the family back" | Sacrifice a different family, or wait. Never restore under a live agent. |
| "Family A's agents are done but B's still run — hold everything until all finish" | Revert is per-family. Free A now; A's snapshot and B's are independent. |
| "Five different Targets at once — bind a family twice" | A family holds one Target at a time. Four Targets max concurrently; queue the fifth. |
| "The snapshot is stale and its process is dead — bind over it" | The held snapshot is the only recovery record. Revert it explicitly first. |
| "The warning is advisory and the deadline is now" | The user decides, before spawn — not you. |
| "Restore anyway, cleanup is my job" | Revert overwrites the live row. If someone changed it since the snapshot, that's newer state — report, don't clobber. |
| "User asked to rebind a family — run the full dance" | No subagent to run = plain routing edit. One `set`, no snapshot, no checklist. |

## Red flags — STOP

- Reverting before an agent's completion notification arrived
- Binding a family whose snapshot is already held (`already snapshotted`) without reverting it first
- Hand-editing the snapshot store or `wisp routing set`-ing over a held snapshot instead of reverting
- Passing an Alias or `provider/model` string as the Agent model
- Spawning while a `warning:` line is unsurfaced

## Limits

- A crash or force-kill skips cleanup by design — a held per-family snapshot enables next-session recovery; nothing guarantees restore.
- Revert is unconditional: it overwrites whatever the row currently holds and clears the snapshot, with no compare-and-set. The skill re-reads `wisp routing` first if it wants a guard.
- Up to 4 concurrent Slots — one per family word (`haiku`/`sonnet`/`opus`/`fable`). A distinct Target needs a distinct family, and all agents on one family share its Target. More than 4 distinct Targets at once is impossible; free a family before binding a fifth Target. No queue is built for that case.
