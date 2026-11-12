---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, claude, launcher]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra), agent 4e866204-7f11-40a3-879e-1593aed80b6b._
_Merged main: d209004fd31383682b1f4aeb5a0986fbb6959e35; tree identical to tested/reviewed PR head39b9c4c._

## Current focus

Exact Claude launcher context budgets are implemented and locally verified; CodeRabbit passed 3/3 and PR #235 is merged with green platform CI. Wisp's Anthropic request stamp is updated to 2.1.322 at the user's request. No new release, installation or real-client restart is authorized/performed.

## Work contract

- **Authority:** khitarashi, 2026-11-12 in this agent's chat: "Proceed with exact-size support through the Wisp launcher, including safe switching between different context limits and CodeRabbit review", then explicitly requested updating Wisp's stamp. Approved design: `docs/superpowers/specs/2026-11-12-claude-context-design.md`; plan: `docs/superpowers/plans/2026-11-12-claude-context.md`.
- **Execution:** this agent owns the role Claude alias context support. Inline execution in the primary checkout; no worktree. Prior 2.2.11 relay remains stopped/completed.
- **Review:** [[review-policy]] remains on. Checkpoint `claude-context-windows`, **passed 3/3 runs used**, no paid escalation. One authoritative ledger: local `.claude/alias-context-research/work.md`; immutable attempt scope/identity: `review-1/manifest.json`, `review-2/manifest.json`, and `review-3/manifest.json`.
- **Integration:** user explicitly requested merging PR #235 on 2026-11-12. Squash merge d209004 is on main and its Git tree equals reviewed head39b9c4c exactly. Release preparation/publication are not yet authorized. Context checkpoint belongs on main; preserve the unrelated `.context/flows.md` edit.
- **Evidence:** local `.claude/alias-context-research/`: `checks.json`, `launcher-checks.json`, full test/build logs, `native-compiled.log`, and `live-capabilities.json`. All final checks used the existing pinned Bun 1.4.2. Initial old-Bun/PATH failures are recorded in work.md and are not accepted verification.
- **Pending:** none. CodeRabbit reviewed19/19 initial paths, six/six follow-up paths after four issues were fixed, and one/one final packaging-fix path. Both follow-ups completed exit0 with zero issues. Combined hashes match delivered product source. Final receipt: local `.claude/alias-context-research/receipt.json`.
- **Checkpoint:** implementation, PR creation and requested merge complete. [PR #235](https://github.com/EstarinAzx/Wisp-Router/pull/235), merged as d209004 from head39b9c4c, CI43163207542: all four builds and packaging smokes passed; publication skipped for PR. Release preparation/publication and installation await a separate user request.

## Verified state

- Core 2153 tests; TUI 202 tests/1109 assertions; core/TUI typechecks; companion build; slot statusline self-check all passed.
- Installed Claude Code 2.1.322 driven through both source and compiled launchers reports 128000/400000/500000/1000000 windows and routes each fixture correctly. SDK model switch is refused before upstream generation, preserving the 500K budget. Synthetic loopback only, no real-provider generation.
- Metadata-only reads of the user's configured targets returned Grok 4.7 = 500000 and Carbon (`gemini-4-carbon-high`)=1048576. No refresh/sign-in/settings change occurred. This is catalogue evidence, not full-window inference qualification.
- Header and body regression tests both verify the 2.1.322 stamp. Beta selection and other fingerprint fields remain unchanged; new stamp live Anthropic acceptance remains untested.

## Behavior and limits

Launch with `claude-wisp --model <alias>`; without a model use Wisp's Active Provider. Each child gets a signed target-bound profile and temporary settings. Different targets require exit/relaunch with `--resume <session> --model <alias>`. Inherited-model subagents work; other-target requests are refused. Server-side advisor routing remains separate. Unknown capacity is explicitly fallback 128000, not a verified limit. Ordinary copied-env gateway sessions retain their old context behavior. See `docs/claude-wisp.md` and the investigation report.

The prior Wisp 2.2.12 / companion 1.14.9 publication remains complete. Final main 3358c0f and source/tag e251eb3 are preserved; prior native-usage and release-prep reviews remain passed 2/3 each. Source/package identities and installation boundaries stay in local `.claude/wisp-2.2.12/release-receipt.json`; the full prior baton remains in Git at 3358c0f. No prior release watcher/worker remains active. Existing live-compaction, full-window, Local sign-in, direct Claude forced-ANY and old Antigravity-chat limits are unchanged; [[release-follow-ups]] retains held work.

## Pick up here

No active implementation or review. PR #235 is merged. Preserve passed 3/3 review evidence; no fourth implementation review. Code is ready for release preparation, but versions remain terminal2.2.12, companion1.14.9 and slot1.7.5. A new release still needs version/notes updates, a distinct release-prep review checkpoint, rebuilt/package verification and publication authorization. No release tag or installation was performed. Preserve the pre-existing flow note.

## Related

- [[pick-up]]
- [[overview]]
- [[review-policy]]
- [[release-follow-ups]]
