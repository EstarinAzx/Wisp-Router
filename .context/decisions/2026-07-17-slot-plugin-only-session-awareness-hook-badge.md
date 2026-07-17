---
type: decision
project: wisp
updated: 2026-07-17
tags: [context, decision]
---

# Slot goes plugin-only on the dev machine + session-awareness = hook + badge (#124)

**Decision.** From the 2026-07-17 #124 grill:

1. **Session-awareness ships as three parts** in `wisp-slot` 1.1.0: a SessionStart
   hook (all sources — startup/resume/clear/compact) injecting Wisp announcement +
   live routing snapshot + headless CLI cheat sheet + stale-lease warning; a node
   statusline badge with live family resolution (`[WISP fable→<model>]`) and a
   `!LEASE` marker; both silent/absent when not bridged.
2. **Bridged detection = env + home:** `ANTHROPIC_BASE_URL` non-empty AND the Wisp
   home dir exists (`WISP_HOME` honored). Env alone matches foreign proxies; a full
   HTTP probe was rejected (dead Bridge self-announces on first request anyway).
3. **Node for both scripts** — cross-platform, spawns `wisp routing --json`
   fail-soft, reads real session env (no PowerShell profile trap).
4. **Badge is family-level only** — aliases stay a CLI query; unmatched model or
   unreadable config degrades to `[WISP]`, never guesses.
5. **The personal skill copy is retired** (`~/.claude/_deprecated/slot/`); the
   plugin, installed from a **local directory marketplace** pointing at this
   checkout, is the one copy on the dev machine too — reverses the
   "never `/plugin install wisp-slot` locally" rule from the two-copies era. The
   source-checkout fallback for pre-2.0.11 globals died with it (global is 2.0.13).

**Why.** The family word in the Agent/statusline UI actively lies about the real
backend; the badge makes the live route visible and the hook makes the *model*
aware it can query and rebind routing. One copy ends the fix-both-copies tax;
directory-marketplace install keeps the repo as source while `claude plugin update
wisp-slot` refreshes the versioned cache.

**Reversibility.** Easy — scripts are additive plugin content; the personal copy
sits intact in `_deprecated/` if the split ever needs to come back. Badge wiring
is one block in elucidate's composed statusline wrapper (checkout path, stable
across plugin versions).

## Related

- [[decisions]] — index
- [[2026-07-17-slot-skill-ships-as-repo-plugin-marketplace]]
- [[2026-07-17-slot-skill-lease-file-explicit-restore]]
- [[slot-skill-has-two-copies-personal-vs-plugin]] — the gotcha this rewrites
- [[powershell-profile-env-masks-session-env]] — why detection distrusts env alone
