# Slot Skill Design

**Issue:** #110  
**Parent spec:** #107  
**Date:** 2026-07-17

## Purpose

Create a personal Claude Code skill that turns Wisp's low-level Routing CLI into one safe operation: temporarily bind a Claude family route to any Wisp Target, launch a subagent through that family, then restore the exact prior route.

The skill is Claude's reusable instruction layer. It does not add a router, service, MCP server, or wrapper command.

## Deliverable

Create one personal skill:

```text
~/.claude/skills/slot/SKILL.md
```

The directory name exposes `/slot`. The skill accepts:

- required Target: `<providerId>/<model>`
- optional Slot family: `haiku` by default; `sonnet`, `opus`, or `fable` when named
- required subagent task

The skill uses `wisp routing --json`, `wisp routing set`, `wisp routing unset`, and Claude Code's Agent tool. No helper script or lifecycle hook is needed.

## Durable Lease

Before changing routing, write one lease:

```text
~/.claude/slot/lease.json
```

It records:

- chosen Slot family
- temporary Target
- exact prior state: prior Target or `unset`

Only one lease may exist. An existing lease means another Slot operation may still own the family route or an earlier session exited before cleanup. The skill must not overwrite it.

Recovery is explicit. The skill surfaces the saved state and restores only after the user confirms no Slot-driven agent remains active. Claude Code has no guaranteed skill-finally event: `SessionEnd` cannot block exit and may not run after a crash or force-kill.

## Workflow

1. **Check Bridge use and reachability.** Confirm the current Claude Code session points at the Wisp Bridge. Probe its `/v1/models` endpoint without sending the Bridge secret. Any HTTP response proves a listener is present; connection refusal or timeout means stop and ask the user to start the Bridge.
2. **Check ownership.** If the lease exists, do not rebind or spawn. Surface the lease and follow the recovery rule above.
3. **Validate inputs.** Require a Target, subagent task, and a family from `haiku | sonnet | opus | fable`. Default the family to `haiku`.
4. **Snapshot.** Read `wisp routing --json`, extract the selected family's current route, and persist the lease before mutation. Preserve an absent route as `unset`.
5. **Bind.** Run `wisp routing set <slot> <target>`.
   - On non-zero exit, read routing again. If the Slot still equals its saved prior state, delete the unused lease and stop. Any other state is a conflict: surface it and keep the lease for explicit recovery.
   - On zero exit, verify the Slot equals the temporary Target before spawning.
   - If output contains a `warning:` line, show it before spawning. Continue only after the user chooses to proceed; otherwise restore immediately.
6. **Spawn.** Call Agent with `model` set to the selected family name. Wisp resolves that family to the temporary Target. Wisp Aliases are not valid substitutes for this Agent model value.
7. **Hold.** Keep the binding while any agent launched through this lease is still running. Multiple agents may share the lease only when deliberately launched as one batch; restore waits for all of them.
8. **Guard restoration.** After all Slot-driven agents finish, read routing again. Restore only if the Slot still points at the temporary Target. If another actor changed it, surface the conflict and leave both routing and lease untouched rather than clobbering newer state.
9. **Restore.** Restore a prior Target with `wisp routing set`; restore an originally absent route with `wisp routing unset`. Read routing once more and confirm the selected family matches the saved state. Delete the lease only after successful verification.

## Safety Rules

- Never restore while a Slot-driven agent is running. The Bridge resolves routing on every request, so early restore silently redirects that live agent's next turn.
- Never overwrite an existing lease.
- Never hide a credential `warning:` or spawn before the user sees it.
- Never use a Wisp Alias as the Agent model argument; use the selected Claude family.
- Never overwrite a route changed by another actor after the temporary binding.
- Never claim crash-proof cleanup. The lease enables recovery; it cannot guarantee cleanup after process loss.

## Skill Authoring

`SKILL.md` follows the personal-skill format:

- YAML frontmatter with `name` and a trigger-only `description` beginning with `Use when...`
- concise overview and linear procedure
- explicit safety rules and common mistakes
- no bundled script, hook, or heavy reference file

The description should trigger when a user asks a bridged Claude Code session to run a subagent on a Wisp Target that the Agent tool cannot name directly.

## Verification

Skill creation follows documentation TDD:

1. Run a baseline subagent scenario without the skill and record failures relevant to this workflow.
2. Write the minimal skill addressing observed failures plus the issue's required safety invariants.
3. Run the same scenarios with the skill and verify correct command order, warning behavior, no early restore, and exact restoration of both bound and unset prior states.
4. Exercise one real bridged Claude Code session end to end: bind a credential-ready Target, launch an Agent through the selected family, confirm the Bridge host's route log names that Provider and pinned model, wait for completion, restore, and verify the original map.

The globally installed Wisp 2.0.10 predates `wisp routing`. For verification, use the current source entry through a temporary PATH shim or equivalent session-local command. Do not replace the user's global installation merely to run the proof.

## Out of Scope

- Shipping the skill with Wisp or installing it for other users
- MCP server or Wisp `swap` command
- Automatic Bridge startup
- Concurrent independent leases
- Guaranteed cleanup after crashes
- Changes to repository product source
