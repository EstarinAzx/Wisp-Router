---
type: decision
project: wisp
updated: 2026-07-18
tags: [context, decision]
---

# Slot skill: parallel per-family Slots (wisp-slot 1.2.0)

**Decision.** The Slot skill now supports **concurrent independent Slots** — reversing the
`2026-07-17-slot-skill-design.md` (#110) §98 "Concurrent independent leases → out of scope"
line. The single `~/.claude/slot/lease.json` becomes **one file per family**:
`~/.claude/slot/lease-<family>.json`. Each family (`haiku`/`sonnet`/`opus`/`fable`) is its
own Slot with its own lease, held and restored independently. Up to **4 distinct Targets run
at once** (one per family word); agents on the same family share its Target. The hook lists
every stale `lease-*.json`; the statusline badge shows `!LEASE×N`. No queue for a 5th distinct
concurrent Target (platform ceiling — only 4 family words). Plugin bumped 1.1.2 → 1.2.0.

**Why.** User wanted to summon subagents in parallel and assign each its own Target at the same
time. The old constraint was mechanical, not a safety wall — the spec scoped it out only because
one fixed lease file = one recovery record. The load-bearing invariant (never restore a route
while an agent on it runs) is **per-family**: the Bridge resolves each family independently, so
`haiku→A` and `sonnet→B` never interact and restoring one can't disturb the other's live agent.
Splitting the lease per family makes the recovery record independent too, and a `lease-*.json`
glob keeps the hook/badge detection back-compatible with a legacy singular `lease.json`.

**Reversibility.** Easy — one markdown skill file + two small JS globs + a version bump. The
4-Target ceiling is a Claude Code platform fact (Agent tool accepts only 4 family words), not a
skill choice; a queue for >4 sequential batches is a future add if ever needed.

## Related

- [[decisions]] — index
- [[2026-07-17-slot-skill-lease-file-explicit-restore]] — the single-lease model this supersedes
- [[2026-07-17-slot-plugin-only-session-awareness-hook-badge]] — hook + badge this extends
