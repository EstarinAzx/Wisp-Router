---
type: gotcha
project: wisp
updated: 2026-07-17
tags: [context, gotcha]
---

# The Slot skill lives in the plugin — and plugin edits need a cache refresh

History: the skill existed twice, deliberately diverged (personal machine-specific
copy in `~/.claude/skills/slot/` vs the generalized plugin copy). **Ended
2026-07-17:** the personal copy is retired to `~/.claude/_deprecated/slot/`; the
plugin `wisp-slot@wisp-router` is the one copy everywhere, installed on this
machine from a **local directory marketplace** pointing at this checkout.

Traps that remain:

- Directory marketplaces still install a **versioned snapshot** into
  `~/.claude/plugins/cache/wisp-router/wisp-slot/<version>/` — editing
  `plugins/slot/**` in the repo does NOT reach the live skill/hook until
  `claude plugin update wisp-slot` (and a version bump gives a fresh cache dir).
- The statusline badge is the exception: elucidate's composed wrapper
  (`~/.claude/skills/elucidate-plugin/src/hooks/statusline-wrapper.ps1`) calls
  the badge script at the **checkout path** (stable across versions, unlike the
  cache), so badge edits are live immediately — asymmetric with hook edits.
- The old "never `/plugin install wisp-slot` on this machine" rule is dead —
  reversed by the same decision that retired the personal copy.

## Related

- [[gotchas]] — index
- [[2026-07-17-slot-skill-ships-as-repo-plugin-marketplace]]
