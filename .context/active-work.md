---
type: active-work
project: wisp
updated: 2026-11-11
tags: [context, active-work, vscode]
---

# Active Work

_Last updated: 2026-11-11 by Codex (GPT-6 Astra)._
_Argon implementation: 427993c (Local continuation), 33c8895 (exact tool pairing), 05a5f4a (native adapter). PR #232 tracks integration._

## Current focus

Implementation and independent review are complete. The user deferred hands-on Argon testing to the next session and requested ownership transfer plus integration into local `main`. The next session belongs in the **primary checkout on `main`**, not the retained development worktree. [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232) remains the remote integration vehicle; no release/install is requested.

**Workspace guard:** if this file is being read from a linked worktree or a branch other than `main`, use `git worktree list --porcelain` to locate `refs/heads/main`, then read that checkout's `.context/pick-up.md`. That is the single authoritative baton. Older `wisp/` notes and backup snapshots are historical, not alternative current batons.

## Work contract

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
- **Pending:** no implementation/review worker. Ownership handoff uses the local state/receipt above. Real-provider and interactive Local compaction acceptance remain untested. The successor waits for the user next session.
- **Checkpoint:** implementation complete; user testing deferred. Integration receipts must establish the primary-main revision and preservation before transfer. Remote merge/release/install/forced reload remain outside this local-only grant.

## Pick up here

Wait for the user in the next-session root chat. When they are ready, verify primary `main` and the handoff receipt, then open a development host from **that checkout's `packages/vscode`** and choose an exact Argon low/medium/high model in a new chat. The currently open dev host was launched from the old worktree, so merely reloading it does not change its source path. Do not close/reload it or make live generations now. Do not repeat implementation/review or revive the old audit/release.

## Implementation calls

- Argon low/medium/high has a native text/tool adapter for VS Code1.145.3+. Classic Copilot uses encrypted per-assistant packets; Local sends only a previous marker and incremental input, restored from a32-checkpoint/16MiB serialized-history memory cache. Authenticate account/endpoint/tier/conversation before lookup. Local needs a new chat after reload/eviction; classic full history remains independently replayable. No Bridge secret/start or disk conversation store is used. Missing/tampered state fails before transport. Images, Carbon/other unqualified IDs and Antigravity Inquire remain unsupported.
- `wisp.codexContextWindows` is optional, machine/user-scoped and keyed by exact model ID. Defaults remain account metadata; overrides cannot exceed the known maximum, or known default when the maximum is missing. No native Codex config import/mutation and no blanket API-sized context.
- Traycer browser DOM automation passed, but screenshot/viewport requests timed out. Isolated headless Chrome supplied the inspected captures; no real browser profile was used. Canvas inline rendering is unavailable; the canvas remains a Task artifact.
- The user-requested dev window remains attached to the old worktree. Keep that worktree until the user has moved testing to the primary checkout and separately agrees to cleanup. Review workers and isolated test windows completed. One temporary test-profile askpass socket resisted cleanup; its remainder is recorded locally and no permissions or user processes were changed.
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
