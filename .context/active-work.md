---
type: active-work
project: wisp
updated: 2026-11-11
tags: [context, active-work, vscode]
---

# Active Work

_Last updated: 2026-11-11 by Codex (GPT-6 Astra)._
_Implementation commit: 607d359 on fix/vscode-provider-parity, based on released main 2cfab42._

## Current focus

VS Code provider-parity implementation is complete and published for review in [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232), `fix/vscode-provider-parity` into `main`. Antigravity controls/discovery/native chat and bounded Codex context are repaired. All three independent-review findings are fixed. Merge, release and installed-client acceptance remain separate actions.

## Work contract

- **Authority:** khitarashi, 2026-11-11, after screenshots and explanations of all four areas: “all the fixes needed for the vscode extension do it on next main”. Execute repairs, not another diagnosis-only response. Detailed scope/boundaries: `.claude/vscode-parity/brief.md`.
- **Continuation:** khitarashi's “continue” after the push-and-open-PR next step authorized branch publication and PR creation on 2026-11-11. PR #232 is open; no merge, release, installation or reload approval was added.
- **Execution:** main coordinator `fb4039a5-d425-4645-bd13-be27b8f68364`, role “VS Code fix coordinator”. Inline implementation with TDD and one fresh independent whole-diff review. No active relay or implementation worker.
- **Review:** existing independent review discipline. No persistent CodeRabbit opt-in exists. Prior audit checkpoint completed at 1/3 with complete 47-file coverage; preserve that closed record and do not treat it as evidence for new code.
- **Storage/integration:** versioned context, gitignored machine-local execution records. The existing isolated worktree/dependencies and diagnostic notes were preserved; implementation is on `fix/vscode-provider-parity`. Other checkout's dirty main is not an implementation workspace.
- **Evidence:** implementation `607d359`: 2009 core tests; 201 TUI tests/896 assertions; core/TUI types and extension compile passed. Built Preact browser harness passed, including account/key replacement; headless Chrome captures inspected at 390 px with synthetic account states. Logs in `.claude/vscode-parity/`; Task artifact `vscode-provider-parity` has the plan and captures.
- **Review disposition:** reviewer `303581b2-b8b2-4d07-b29b-c9d008303b5c` covered all 20 initial files in `2cfab42..dc49531` (report `.claude/vscode-parity/review.md`). Its three P2 findings were fixed in `607d359` with observed failing-then-passing tests: repeated sign-out, same-provider credential replacement and the full automatic-discovery deadline. The inline workflow uses one final review and a regression-tested correction pass, not a second review claim.
- **Pending:** no implementation worker/reviewer. Inspect PR #232 for latest-head automation: four native build/smoke checks plus the repository's CodeRabbit app run on PRs. No local CodeRabbit run was started and the old audit checkpoint is unchanged. Publication is guarded to version-tag pushes.
- **Checkpoint:** implementation and authorized PR creation complete. Preserve the branch/worktree; further integration or installed-host testing needs the user's next instruction.

## Pick up here

Read [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232), [behavior and validation](../docs/vscode-provider-parity.md) and the user's next instruction. No merge, release, install or reload approval exists. Do not duplicate the PR, repeat the implementation or revive the old audit/release.

## Implementation calls

- Native Antigravity chat supports the shared known text-model catalogue. Argon, image-output and unqualified IDs are hidden and refused with a panel explanation. Argon remains qualified through Bridge Responses; opaque replay survival through Copilot persistence/compaction is unproven. Antigravity Inquire is explicitly unavailable.
- `wisp.codexContextWindows` is optional, machine/user-scoped and keyed by exact model ID. Defaults remain account metadata; overrides cannot exceed the known maximum, or known default when the maximum is missing. No native Codex config import/mutation and no blanket API-sized context.
- Traycer browser DOM automation passed, but screenshot/viewport requests timed out. Isolated headless Chrome supplied the inspected captures; no real browser profile was used. Canvas inline rendering is unavailable; the canvas remains a Task artifact.
- Synthetic preview tab/server were closed and the completed reviewer archived. No task-owned process remains running.
- Review corrections persist unique sign-out tombstones (legacy empty tombstones are marked before sign-in), scope model replies to a process-local HMAC credential version, and include token/project preparation inside the four-second panel fallback. A full-suite test collision on callback port 51121 was fixed by isolating the extension-test listener; the real auth loopback tests remain intact.

## Boundaries and earlier work

- Preserve credentials, routing/provider/model settings, permissions, hook trust and running clients. Use synthetic/intercepted/loopback tests. Screenshots grant no live provider or large-context spending allowance.
- Earlier merge/push/release authorization was completed for2.2.9. This task authorizes implementation; a new release, installation or forced reload is not implied.
- Slot is separately updated to1.7.5. Its local marketplace main checkout was fast-forwarded to2cfab42 while preserving236 user files and six protected config/auth files.
- Old2.2.7 provider experiments remain closed. Previous baton/pick-up are preserved in `.claude/vscode-parity/prior-context/`; dated evidence and held work remain in [[release-follow-ups]]. Do not restart historical probes.
- Argon remains qualified for Bridge Responses; native VS Code chat must preserve its encrypted replay/tool state before support can be claimed.

## Related

- [[pick-up]]
- [[overview]]
- [[flows]]
- [[decisions]]
- [[release-follow-ups]]
