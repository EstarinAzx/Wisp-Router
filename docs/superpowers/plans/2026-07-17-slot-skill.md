# Slot Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and verify the personal `/slot` skill that teaches Claude Code the rebind → spawn → restore dance over `wisp routing` (issue #110).

**Architecture:** One markdown skill at `~/.claude/skills/slot/SKILL.md` plus a durable lease file at `~/.claude/slot/lease.json`. No scripts, no hooks, no repository product source. Verification follows documentation TDD: baseline already ran (RED), skill addresses the observed failure, pressure re-test (GREEN), then one real bridged end-to-end proof.

**Tech Stack:** Claude Code personal skills, `wisp routing` CLI (source entry via Bun), Agent tool, Wisp Bridge.

**Spec:** `docs/superpowers/specs/2026-07-17-slot-skill-design.md`, GitHub issue #110, parent spec #107.

## Global Constraints

- No changes to Wisp repository product source; the deliverable lives under `~/.claude/`.
- Global npm `wisp-router` stays at 2.0.10. Every routing command during verification runs from the repo root as `bun packages/tui/src/index.tsx routing …`.
- Real routing edits happen only in Task 3, always lease-first, always restored; never bind a family to an `anthropic/*` Target (quota gotcha in `.context/gotchas/`).
- Pressure-test prompts are decision-only and must say so explicitly — baseline scenario 1 executed real commands when this line was missing.
- In the `~/.claude` git repo, stage only the new Slot files; `ecosystem-kb/index.md` and `log.md` carry unrelated uncommitted edits and stay unstaged.
- SKILL.md: trigger-only description starting "Use when", body under 200 lines, forward-slash paths.

## Baseline (RED) — already run, 2026-07-17

Three decision-only scenarios against agents without the skill:

1. **Early restore (haiku/general agent): FAILED.** Chose "restore immediately after the Agent returns its task id", rationalizing "the family rebind only needs to be live at Agent spawn" and "other terminals keep the real haiku path". Also confirmed: Agent `model` takes family words only — a raw `provider/model` string was correctly rejected.
2. **Warning bypass + lease overwrite (sonnet agent): passed** — surfaced the warning, refused the overwrite.
3. **Restore conflict (opus agent): passed** — left the externally-changed route, kept the lease, reported.

The skill's strongest counters therefore target the early-restore rationalizations; the other invariants stay as required rules from #110.

## File Structure

- `~/.claude/skills/slot/SKILL.md` — the deliverable (Task 1).
- `~/.claude/slot/lease.json` — runtime state, created/deleted by the procedure; never committed.
- `~/.claude/ecosystem-kb/wiki/skills/slot.md` — vault page (Task 4).
- `~/.claude/ecosystem-kb/index.md`, `log.md` — one-line index entry + log entry (Task 4, left uncommitted).
- `~/.claude/CLAUDE.md` — routing-sheet row (Task 4; file is untracked, no commit).

---

### Task 1: Author SKILL.md and re-run pressure scenarios (GREEN)

**Files:**
- Create: `~/.claude/skills/slot/SKILL.md`

**Interfaces:**
- Consumes: `wisp routing --json | set | unset` (source entry), Agent tool `model` family parameter.
- Produces: the `/slot` command; lease contract `{ "slot", "temporary", "prior" }` with `"prior": "unset"` for an absent route.

- [ ] **Step 1: Write the skill file exactly as follows**

````markdown
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

`wisp routing` needs wisp-router newer than 2.0.10. If the installed global lacks it (`wisp routing` opens the TUI instead of printing), run the source entry from the Wisp repo checkout:

```
bun packages/tui/src/index.tsx routing --json
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

**1. Bridge check.** The session must point at the Bridge (`ANTHROPIC_BASE_URL` like `http://127.0.0.1:41184`). Probe without the secret — any HTTP status proves a listener; refused/timeout means stop and ask the user to start the Bridge:

```
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:41184/v1/models
```

**2. Lease check.** If `~/.claude/slot/lease.json` exists, STOP. Do not rebind, spawn, or overwrite. Surface its contents. Only after the user confirms no Slot-driven agent is still running: restore from the lease (step 8 semantics), verify, delete it — then start fresh.

**3. Snapshot + write lease.** Read `wisp routing --json`, extract the Slot family's current entry, and write `~/.claude/slot/lease.json` BEFORE any mutation:

```json
{ "slot": "haiku", "temporary": "codex/gpt-5.6-terra", "prior": "xai/grok-4.5" }
```

Use `"prior": "unset"` when the family has no route.

**4. Bind + verify.** Run `wisp routing set <slot> <providerId>/<model>`. Non-zero exit → re-read routing: Slot still equals prior → delete the unused lease and stop; anything else → surface the conflict, keep the lease. Zero exit → re-read and confirm the Slot now equals the temporary Target.

**5. Warning gate.** Any `warning:` line from `set` (missing key / signed out) goes to the user BEFORE spawning. Proceed only on their yes; otherwise restore immediately and delete the lease.

**6. Spawn.** Call the Agent tool with `model: "<slot family>"` — the family word. Never the Target string, never a Wisp Alias (Aliases do not exist in the Agent model surface).

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
````

- [ ] **Step 2: Re-run pressure scenario 1 (the baseline failure) WITH the skill**

Dispatch a general-purpose agent whose prompt is: the scenario-1 text (2-minute deadline, "restore as soon as Agent returns its task id", other-terminal pressure) + the full SKILL.md content pasted in + this line: "This is a decision simulation. Do NOT execute shell commands, modify routing, create/delete lease files, or spawn agents. Return the chosen option and exact intended sequence only."

Expected: chooses B (hold until the agent finishes), cites the Iron Rule or the task-id row.

- [ ] **Step 3: Re-run scenarios 2 and 3 the same way**

Expected: scenario 2 → surface warning, refuse lease overwrite; scenario 3 → leave the newer route, keep the lease.

- [ ] **Step 4: Judge results**

All three comply → Task 2 is a no-op; continue to Task 3. Any violation → capture the new rationalization verbatim and do Task 2.

### Task 2: REFACTOR — close loopholes (only if Task 1 found violations)

**Files:**
- Modify: `~/.claude/skills/slot/SKILL.md`

- [ ] **Step 1:** Add one rationalization-table row + one red-flag line per new excuse, verbatim countering it. No nuance clauses.
- [ ] **Step 2:** Re-run the failing scenario. Repeat until compliant.

### Task 3: Live end-to-end proof (acceptance criterion 5)

Run from this bridged session (its `ANTHROPIC_BASE_URL` already points at the Bridge), following the skill's own checklist literally.

- [ ] **Step 1: Bridge + lease preconditions**

```
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:41184/v1/models
```
Expected: an HTTP status (401 fine). And `~/.claude/slot/lease.json` must not exist.

- [ ] **Step 2: Snapshot and write lease**

`bun packages/tui/src/index.tsx routing --json` → expect `haiku: xai/grok-4.5` (re-read live; use whatever is current as `prior`). Write `~/.claude/slot/lease.json`:

```json
{ "slot": "haiku", "temporary": "codex/gpt-5.6-terra", "prior": "xai/grok-4.5" }
```

- [ ] **Step 3: Bind and verify**

```
bun packages/tui/src/index.tsx routing set haiku codex/gpt-5.6-terra
```
Expected: exit 0, no `warning:` (Codex is signed in). Re-read `--json`: haiku = `codex/gpt-5.6-terra`.

- [ ] **Step 4: Spawn through the Slot**

Agent tool, `model: "haiku"`, trivial task ("Reply with one sentence describing your task"), wait for the completion notification.

- [ ] **Step 5: Confirm the Target answered**

Ask the user to confirm the `wisp serve` terminal shows a route line naming the Provider and pinned model, shaped like:

```
[bridge] route family 'claude-haiku-…' -> codex model=gpt-5.6-terra
```

(The Bridge host is the user's `wisp serve` process; its console is the route log named by the spec.)

- [ ] **Step 6: Guarded restore + verify + delete lease**

Re-read `--json` (haiku must still be `codex/gpt-5.6-terra`), then:

```
bun packages/tui/src/index.tsx routing set haiku xai/grok-4.5
```

Re-read `--json`: haiku = `xai/grok-4.5` and the map matches the Step-2 snapshot byte-for-byte. Delete `~/.claude/slot/lease.json`.

- [ ] **Step 7: Tick acceptance criteria on issue #110** (comment with the evidence summary; close after Task 4).

### Task 4: Ecosystem sync + commits

**Files:**
- Create: `~/.claude/ecosystem-kb/wiki/skills/slot.md`
- Modify: `~/.claude/ecosystem-kb/index.md` (one line, Skills section), `~/.claude/ecosystem-kb/log.md` (one entry)
- Modify: `~/.claude/CLAUDE.md` (one routing-sheet row)

- [ ] **Step 1: Vault page** — `wiki/skills/slot.md`:

```markdown
---
type: skill
updated: 2026-07-17
tags: [skill, wisp, routing]
source: built 2026-07-17; spec Wisp repo docs/superpowers/specs/2026-07-17-slot-skill-design.md (#110)
---

# slot

`/slot` — the Wisp Slot dance: snapshot the Routing map, rebind a sacrificial
family route (default `haiku`) to any Wisp Target, spawn the Agent tool with
that family word, restore only after every Slot-driven agent finishes. Durable
lease at `~/.claude/slot/lease.json` (never overwritten; stale lease =
explicit recovery, crash cleanup is best-effort by design). Iron rule: the
Bridge resolves routing per request, so early restore silently reroutes a
live agent — a returned task id proves launch, not completion. Aliases never
work as Agent model values; family words only. `wisp routing` needs
wisp-router > 2.0.10 — older global → run the source entry
(`bun packages/tui/src/index.tsx routing …`) from the Wisp checkout.
```

- [ ] **Step 2: Index line** (Skills section of `index.md`):

```markdown
- [[slot]] — Wisp Slot dance: rebind sacrificial family → spawn Agent → restore; lease at ~/.claude/slot/
```

- [ ] **Step 3: Log entry** (top of `log.md` entries):

```markdown
## [2026-07-17] add | slot skill (Wisp #110)

New personal skill [[slot]] — Claude Code drives its own Wisp routing:
snapshot → lease → rebind Slot family → spawn Agent via family word →
hold until agents finish → guarded restore. Built TDD-style (baseline
early-restore failure observed, countered, re-tested green); verified live
end-to-end through the Bridge. Vault + routing sheet synced same session.
```

- [ ] **Step 4: Routing-sheet row** — in `~/.claude/CLAUDE.md` Situation → invoke table:

```markdown
| Subagent on a non-Claude Target (Wisp) | `/slot` — rebind sacrificial family, spawn, restore |
```

- [ ] **Step 5: Commit new files only** in `~/.claude`:

```bash
git -C "$HOME/.claude" add skills/slot/SKILL.md ecosystem-kb/wiki/skills/slot.md
git -C "$HOME/.claude" commit -m "feat(skills): add slot skill (Wisp rebind-spawn-restore)"
```

`index.md` / `log.md` stay uncommitted (they carry unrelated pending edits); `CLAUDE.md` is untracked.

- [ ] **Step 6: Close #110** with a comment mapping each acceptance criterion to its evidence.

- [ ] **Step 7: Offer `/preset health`** (standing rule: ecosystem changed → vault synced same session; health gates any template push — the skill is personal-only, so template mirroring is a curation question for the user, not part of this task).
