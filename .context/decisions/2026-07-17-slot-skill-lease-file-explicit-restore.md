---
type: decision
project: wisp
updated: 2026-07-17
tags: [context, decision]
---

# Slot skill: lease file + explicit restore, no hook (#110)

**Decision.** The personal Slot skill (`~/.claude/skills/slot/`) uses a durable lease file
(`C:/Users/S.D/.claude/slot/lease.json`, absolute path) written before any routing mutation,
and an explicit guarded restore after every Slot-driven agent finishes — no `SessionEnd` hook,
no skill-scoped cleanup hook. One lease at a time; an existing lease is never overwritten
(stale = explicit recovery). Restore is a read-then-write guard: if another actor changed the
Slot, report and keep the lease rather than clobber. Agent `model` takes family words only —
never a Wisp Alias or `provider/model` string.

**Why.** Claude Code has no guaranteed skill-finally event: `SessionEnd` cannot block exit and
skips on crash/force-kill, so a hook would fake a guarantee the platform doesn't give. Baseline
TDD runs showed the real failure is early restore ("binding only matters at spawn") — the Bridge
resolves routing per request, so a live agent's next turn re-resolves the family. The CLI has no
compare-and-set, so the restore guard is best-effort by design. Paths are hardcoded (checkout +
lease) after a live run burned minutes hunting the checkout and wrote its lease cwd-relative.

**Reversibility.** Easy — the skill is one markdown file outside the repo; a future
`wisp routing swap` with process-owned restore was already rejected in
[[2026-07-16-routing-cli-plus-slot-skill-not-mcp]] because the Agent tool belongs to Claude Code.

## Related

- [[decisions]] — index
- [[2026-07-16-routing-cli-plus-slot-skill-not-mcp]]
