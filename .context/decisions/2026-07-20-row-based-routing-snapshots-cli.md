---
type: decision
project: wisp
updated: 2026-07-20
tags: [context, decision]
---

# Row-based routing Snapshots, CLI-owned (spec #126)

**Decision.** 2.0.24 adds `wisp snapshot [row]` / `wisp snapshot revert [row]` —
Wisp itself records what a Routing-map row (Family route or Alias) points at
(Target or unset) and restores it on command. **Row-based**, not wholesale: each
row snapshots/reverts independently; rows added after a Snapshot are invisible
to revert-all. Snapshotting an already-held row refuses loudly (the CLI-native
form of the lease-exists STOP rule); revert writes unconditionally, prints what
it overwrote, and clears the entry. Store lives in the Wisp home config beside
the Routing map; the Bridge resolver never reads it. Verb is `revert`
("checkout" was a draft leftover). The Slot skill goes CLI-native on top
(#131): no more LLM Read/Write file tools, no `~/.claude/slot/lease-*.json`.

**Why.** The lease dance made the LLM hand-write recovery state with generic
file tools — slow, error-prone, and Wisp state in a foreign directory. Row
independence is what the parallel-Slot flow needs (free `haiku` while `sonnet`
is still held); wholesale restore would demand whole-map locking and one clear
point. Cost accepted: an alias an agent adds mid-session survives revert-all —
visible in `wisp routing`, one `unset` away. No compare-and-set guard: snapshot
records only the prior state, so revert can't detect third-party edits;
printing the overwritten value is the visibility substitute.

**Reversibility.** Medium-easy. Additive command family; wholesale revert, a
`--force`, or a guarded revert could be layered on later without breaking the
row-based contract. The skill rewrite is prose.

## Related

- [[decisions]]
- [[2026-07-18-slot-parallel-per-family-leases]]
- [[2026-07-17-slot-skill-lease-file-explicit-restore]]
