---
type: decision
project: wisp
updated: 2026-07-16
tags: [context, decision]
---

# Routing CLI + Slot skill, not MCP (spec #107)

**Decision.** Claude Code drives Wisp routing through new `wisp routing` CLI subcommands
(show / `--json` / `set <row> <target>` / `unset <row>`) plus a personal Claude Code skill —
NOT an MCP server, NOT a wrapper command. One verb covers both row kinds (family word →
Family route, anything else → Alias upsert); `<target>` = `providerId/model`, split on the
FIRST slash. Credential check on `set` warns (parseable `warning:` prefix, exit 0, binding
written) — never refuses. The **Slot** pattern (CONTEXT.md term): sacrifice a Family route
(default `haiku`, any family per use) to give the Agent tool's fixed enums an arbitrary
Target; restore at session END only, never mid-agent.

**Why.** The Bridge reads the Routing map fresh per request (ADR-0002), so a config write IS
the live-update mechanism — MCP would add a server lifecycle + per-session schema overhead
to wrap one atomic JSON write. A wrapper (`swap`) can't own the restore because the Agent
tool belongs to Claude Code, not to a process the CLI could wait on. Warning-not-refusal
matches the settled "Targets fail loud at request time" policy without inventing a stricter
second gate. Test seam: one new pure module in core (argv words + injected state →
`{nextMap?, lines, warnings, exitCode}`), same pattern as `slash.ts`; TUI glue untested.

**Reversibility.** Medium — the CLI surface is additive; an MCP wrapper could still be
layered on later without undoing anything. The Slot discipline (restore only at session end)
is load-bearing wherever it's automated.

## Related
- [[decisions]]
- [[happy-path]]
