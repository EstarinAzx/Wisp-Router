---
type: gotcha
project: wisp
updated: 2026-07-17
tags: [context, gotcha]
---

# The Slot skill has two copies — personal (machine-specific) vs plugin (generalized)

The skill exists twice, deliberately diverged:

- **Personal:** `~/.claude/skills/slot/SKILL.md` — hardcoded Windows lease path, fixed
  Bridge port probe, source-checkout fallback for pre-2.0.11 globals. The active copy on
  this machine.
- **Plugin:** `plugins/slot/skills/slot/SKILL.md` in the repo — `~` paths,
  `$ANTHROPIC_BASE_URL` probe, npm-upgrade note. What other users install.

Traps: a behavioral fix to the procedure (Iron Rule, lease semantics, restore guard) must
be applied to **both** copies — they don't sync. And never `/plugin install wisp-slot` on
this machine: it would load a second `slot` skill next to the personal one.

## Related

- [[gotchas]] — index
- [[2026-07-17-slot-skill-ships-as-repo-plugin-marketplace]]
