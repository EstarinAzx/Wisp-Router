---
type: decision
project: wisp
updated: 2026-07-17
tags: [context, decision]
---

# Slot skill ships as a Claude Code plugin; the repo doubles as the marketplace

**Decision.** The Slot skill is distributed to other users as a Claude Code **plugin**:
root `.claude-plugin/marketplace.json` makes the Wisp-Router repo itself a plugin
marketplace, listing `wisp-slot` sourced from `plugins/slot/` (plugin manifest +
`skills/slot/SKILL.md`). Install: `/plugin marketplace add EstarinAzx/Wisp-Router` →
`/plugin install wisp-slot@wisp-router`; the skill lands namespaced as `wisp-slot:slot`.
The shipped copy is generalized — `~/.claude/slot/lease.json`, Bridge probe via
`$ANTHROPIC_BASE_URL`, "upgrade wisp-router via npm" instead of the source-checkout
fallback. This reverses spec #107's "plugin packaging out of scope" line by explicit
user call (2026-07-17).

**Why.** npm can't install files into `~/.claude`, so the npm package could never carry
the skill; a plugin marketplace is the one first-party channel Claude Code gives for
distributing skills. Hosting the marketplace in the existing repo avoids a second repo
and keeps skill + CLI versioned together. The personal copy at `~/.claude/skills/slot/`
stays the winner on this machine — installing the plugin locally would duplicate the
skill (see [[slot-skill-has-two-copies-personal-vs-plugin]]).

**Reversibility.** Easy — delete `plugins/` + `.claude-plugin/`; installs reference the
repo live, so removal just breaks future installs, not the CLI.

## Related

- [[decisions]] — index
- [[2026-07-17-slot-skill-lease-file-explicit-restore]]
- [[2026-07-16-routing-cli-plus-slot-skill-not-mcp]]
