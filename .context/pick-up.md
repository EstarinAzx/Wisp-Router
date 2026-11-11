---
type: pick-up
project: wisp
updated: 2026-11-12
tags: [context, pick-up]
---

# Pick up

Use the primary checkout on local `main`; [[active-work]] is the only current baton. Historical `wisp/` notes and the old worktree are not queues.

**Active: Wisp2.2.11 autonomous implementation.** Read the baton, design/plan and local `.claude/relay/wisp-2.2.11.body.md`. Relay JSON owns runtime ownership; a PREPARE recipient only acknowledges, while an activated owner continues implementation. CodeRabbit mode is on in [[review-policy]]. No worktrees.

Initial Unit3 release checks and CodeRabbit passed; PR233 passed four-platform CI. Its automatic review exposed a stale CLI detail heading. The two-file correction has focused RED/GREEN; full verification passed:2120 core,191 TUI/1027 assertions, types and rebuilt Windows package smokes. The user approved extending this logging checkpoint to5 total attempts; focused attempt4 passed2/2 with zero issues. Next: integrate the corrected head after CI, then transfer final readiness ownership; preserve used4/5. See [[active-work]] and the relay body; preserve all budgets.

Wisp2.2.10 is already released. Current scope is per-session logs, Copilot harness compatibility and next-release readiness on main; it does not authorize republishing2.2.10 or publishing the next release automatically.

## Related

- [[active-work]]
- [[overview]]
- [[review-policy]]
