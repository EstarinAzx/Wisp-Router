---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, vscode]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._
_Argon implementation: 427993c (Local continuation), 33c8895 (exact tool pairing), 05a5f4a (native adapter). PR #232 tracks integration._

## Current focus

The user confirmed basic Argon Local chat works, then requested support for discovered Antigravity models without per-name patches and correction of the 128K context display. The repair uses one native text/chat adapter and account-discovered limits. Core2073/TUI201, core/TUI typechecks and extension build passed. One independent review returned three P2 findings, all fixed with failing-then-passing regressions. Work remains in the **primary checkout on `main`**. The reopened host shows **gemini-4-carbon-high, Context1M**. [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232) remains open; these new changes have not been published.

**Workspace guard:** if this file is being read from a linked worktree or a branch other than `main`, use `git worktree list --porcelain` to locate `refs/heads/main`, then read that checkout's `.context/pick-up.md`. That is the single authoritative baton. Older `wisp/` notes and backup snapshots are historical, not alternative current batons.

## Work contract

- **Current scope:** khitarashi, 2026-11-12: Argon works; remove per-model Antigravity support hardcoding and fix the context display. Implementation plan/evidence: `.claude/vscode-parity/dynamic-models-plan.md`. Live catalogue metadata confirms Argon and Carbon context 1,048,576, output 65,536/262,144 respectively. This is catalogue evidence, not full-window generation acceptance.
- **Current host:** the user requested a reload for Argon/Carbon testing and reported Argon success afterward. After the repair, the host had closed and was reopened from this primary checkout with the final build; observed VS Code1.146.0, Wisp ready, Carbon-high Context1M. No generation prompt or model/settings change was sent. Local chat needs a new conversation after reload.
- **Authority:** khitarashi, 2026-11-11, after screenshots and explanations of all four areas: “all the fixes needed for the vscode extension do it on next main”. Execute repairs, not another diagnosis-only response. Detailed scope/boundaries: `.claude/vscode-parity/brief.md`.
- **Continuation:** khitarashi's “continue” after the push-and-open-PR next step authorized branch publication and PR creation on 2026-11-11. PR #232 is open; no merge, release, installation or reload approval was added.
- **Argon scope:** user said “interesting how it doesnt recognise argon. you have to fix that”, then “sorry mb continue”. Implement working native Argon delivery and continuation, not just picker visibility. Plan/evidence: `.claude/vscode-parity/argon-plan.md`. Their requested dev host remains open; preserve real settings/auth and do not force-reload it.
- **Session handoff authority:** khitarashi said “i'll do this next sesh so transfer ownership and also make sure you merge to lcoal ... i hate when my ais get confused with batons coz of worktrees”. Local-main integration and handoff are authorized; hands-on testing is deferred, not automatic.
- **Next-session owner:** root chat `8f60fde8-74fa-49f0-98e5-788163a75924`, “Wisp VS Code testing - main checkout”, created/verified with the same Codex settings and bound to the primary checkout. Source `fb4039a5-d425-4645-bd13-be27b8f68364` finishes only integration/ownership transfer. Actual ownership activation is recorded in `.claude/vscode-parity/handoff-to-main/state.json`; no relay is active.
- **Review:** existing independent review discipline. No persistent CodeRabbit opt-in exists. Prior audit checkpoint completed at 1/3 with complete 47-file coverage; preserve that closed record and do not treat it as evidence for new code.
- **Storage/integration:** fast-forward the primary checkout's local `main` to this tested PR branch. Keep PR #232 open while the user tests. Local `main` intentionally leads `origin/main`; do not reset it to the remote or start unrelated branches from it. When remote merge is later approved, use a merge commit (not squash) so local `main` can fast-forward to the remote merge. Preserve all unrelated files and the old worktree; source-code acceptance is pinned below.
- **Preservation:** the primary checkout had three stale tracked context edits plus233 untracked files. Exact context snapshots and the236-file hash manifest are in `.claude/vscode-parity/main-before-handoff/`. Unique October14 discovery history is retained in [[flows]]. The latest baton supersedes the old release2.2.8 handoff. Integration/preservation/check receipts live in `.claude/vscode-parity/handoff-to-main/`.
- **Evidence:** `427993c`:2050 core tests (38 Argon-specific), extension build,201 TUI/896 assertions and core/TUI typechecks passed (shared-core production code unchanged since33c8895). Logs: `.claude/vscode-parity/argon-local-core-final.log` and adjacent gate logs. Isolated VS Code1.145.3 real `vscode.lm` check completed three intercepted requests, classic+Local continuation and bad-result-ID refusal; receipt `argon-host-receipt.json`. Pinned classic and Local source functions verified message shapes/persistence. No real provider generation.
- **Review disposition:** reviewer `303581b2-b8b2-4d07-b29b-c9d008303b5c` covered all 20 initial files in `2cfab42..dc49531` (report `.claude/vscode-parity/review.md`). Its three P2 findings were fixed in `607d359` with observed failing-then-passing tests: repeated sign-out, same-provider credential replacement and the full automatic-discovery deadline. The inline workflow uses one final review and a regression-tested correction pass, not a second review claim.
- **Argon review:** `ca2f3228-55ac-4b27-83eb-c8997bf2b773` reviewed `a263f2d..05a5f4a`; its sole P2 pairing issue is fixed at33c8895 with failing-then-passing unknown/duplicate/whitespace-ID regressions and a real-host refusal check. Report `.claude/vscode-parity/argon-review.md`; reviewer archived.
- **Local review:** `20921d38-e92d-462d-823d-67eba81aec38` reviewed all six files in `33c8895..427993c`: PASS, no verified actionable findings. Report `.claude/vscode-parity/argon-local-review.md`; independent checks included38 Argon tests, pinned source contracts and additional scope/cache/refusal probes.
- **Review completion:** `a56a1c74-7a70-4c5c-9891-48a1a7e7de4f` reviewed the full change from27ee22d, including new `nativeAntigravityChat.ts`. Disposition/evidence: `.claude/vscode-parity/dynamic-models-review.md`; four failing regressions for three P2 findings became green, followed by the full suite/build. No review worker remains pending.
- **Checkpoint:** repair and host refresh complete; await user testing. Exact local revision and checks are in `.claude/vscode-parity/dynamic-models-complete.json`. All233 original untracked files hash-match their preservation manifest. No remote merge/push/release/install is authorized by this repair; broad live generations/full-window/interactive compaction remain unverified.

## Pick up here

Wait for the user's test result in the current root chat. The running development host loads **this checkout's `packages/vscode`**, with Carbon-high selected and Context1M visible. Use a new Local chat after reload; do not repeat the completed implementation/review or send unrequested provider generations. Do not revive historical experiments or publish the branch.

## Implementation calls

- Antigravity text/chat models share the native adapter on VS Code1.145.3+, including Carbon/new IDs. Account metadata supplies context/output/image-input capability. Classic Copilot uses encrypted per-assistant packets; Local restores incremental input from a32-checkpoint/16MiB memory cache. Authenticate account/endpoint/model/conversation before lookup. Local needs a new chat after reload/eviction; classic history remains independently replayable. Image-generation output and Antigravity Inquire remain unsupported. Bridge qualification is unchanged.
- `wisp.codexContextWindows` is optional, machine/user-scoped and keyed by exact model ID. Defaults remain account metadata; overrides cannot exceed the known maximum, or known default when the maximum is missing. No native Codex config import/mutation and no blanket API-sized context.
- Traycer browser DOM automation passed, but screenshot/viewport requests timed out. Isolated headless Chrome supplied the inspected captures; no real browser profile was used. Canvas inline rendering is unavailable; the canvas remains a Task artifact.
- Testing has moved to the primary checkout. Retain the old worktree until the user separately agrees to cleanup. One earlier temporary test-profile askpass socket resisted cleanup; its remainder is recorded locally and no permissions or user processes were changed.
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
