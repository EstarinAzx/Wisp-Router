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

Argon native-chat implementation is complete at `427993c`, including classic Copilot and the screenshot's newer Local mode. The initial review's pairing finding is fixed; scoped Local review passed with no actionable findings. [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232) carries this follow-up alongside the earlier parity fixes. The user's dev host needs a reload to load the rebuilt bundle; no forced reload was performed.

## Work contract

- **Authority:** khitarashi, 2026-11-11, after screenshots and explanations of all four areas: “all the fixes needed for the vscode extension do it on next main”. Execute repairs, not another diagnosis-only response. Detailed scope/boundaries: `.claude/vscode-parity/brief.md`.
- **Continuation:** khitarashi's “continue” after the push-and-open-PR next step authorized branch publication and PR creation on 2026-11-11. PR #232 is open; no merge, release, installation or reload approval was added.
- **Argon scope:** user said “interesting how it doesnt recognise argon. you have to fix that”, then “sorry mb continue”. Implement working native Argon delivery and continuation, not just picker visibility. Plan/evidence: `.claude/vscode-parity/argon-plan.md`. Their requested dev host remains open; preserve real settings/auth and do not force-reload it.
- **Execution:** main coordinator `fb4039a5-d425-4645-bd13-be27b8f68364`, role “VS Code fix coordinator”. Inline implementation with TDD and one fresh independent whole-diff review. No active relay or implementation worker.
- **Review:** existing independent review discipline. No persistent CodeRabbit opt-in exists. Prior audit checkpoint completed at 1/3 with complete 47-file coverage; preserve that closed record and do not treat it as evidence for new code.
- **Storage/integration:** versioned context, gitignored machine-local execution records. The existing isolated worktree/dependencies and diagnostic notes were preserved; implementation is on `fix/vscode-provider-parity`. Other checkout's dirty main is not an implementation workspace.
- **Evidence:** `427993c`:2050 core tests (38 Argon-specific), extension build,201 TUI/896 assertions and core/TUI typechecks passed (shared-core production code unchanged since33c8895). Logs: `.claude/vscode-parity/argon-local-core-final.log` and adjacent gate logs. Isolated VS Code1.145.3 real `vscode.lm` check completed three intercepted requests, classic+Local continuation and bad-result-ID refusal; receipt `argon-host-receipt.json`. Pinned classic and Local source functions verified message shapes/persistence. No real provider generation.
- **Review disposition:** reviewer `303581b2-b8b2-4d07-b29b-c9d008303b5c` covered all 20 initial files in `2cfab42..dc49531` (report `.claude/vscode-parity/review.md`). Its three P2 findings were fixed in `607d359` with observed failing-then-passing tests: repeated sign-out, same-provider credential replacement and the full automatic-discovery deadline. The inline workflow uses one final review and a regression-tested correction pass, not a second review claim.
- **Argon review:** `ca2f3228-55ac-4b27-83eb-c8997bf2b773` reviewed `a263f2d..05a5f4a`; its sole P2 pairing issue is fixed at33c8895 with failing-then-passing unknown/duplicate/whitespace-ID regressions and a real-host refusal check. Report `.claude/vscode-parity/argon-review.md`; reviewer archived.
- **Local review:** `20921d38-e92d-462d-823d-67eba81aec38` reviewed all six files in `33c8895..427993c`: PASS, no verified actionable findings. Report `.claude/vscode-parity/argon-local-review.md`; independent checks included38 Argon tests, pinned source contracts and additional scope/cache/refusal probes.
- **Pending:** no implementation or review worker. Latest-head GitHub checks are tracked on PR #232. Real-provider and interactive Local compaction acceptance remain untested.
- **Checkpoint:** authorized Argon implementation/review complete. Preserve the branch/worktree and the user's open dev host. Merge/release/install/forced reload remain outside approval.

## Pick up here

Follow the user's next testing/integration instruction and inspect PR #232 before changing its state. To test the rebuilt extension, reload the Extension Development Host and choose an exact Argon low/medium/high model in Wisp, then open a new chat. Obtain the user's reload instruction before doing that on their running window. Do not repeat completed implementation/review or revive the old audit/release.

## Implementation calls

- Argon low/medium/high has a native text/tool adapter for VS Code1.145.3+. Classic Copilot uses encrypted per-assistant packets; Local sends only a previous marker and incremental input, restored from a32-checkpoint/16MiB serialized-history memory cache. Authenticate account/endpoint/tier/conversation before lookup. Local needs a new chat after reload/eviction; classic full history remains independently replayable. No Bridge secret/start or disk conversation store is used. Missing/tampered state fails before transport. Images, Carbon/other unqualified IDs and Antigravity Inquire remain unsupported.
- `wisp.codexContextWindows` is optional, machine/user-scoped and keyed by exact model ID. Defaults remain account metadata; overrides cannot exceed the known maximum, or known default when the maximum is missing. No native Codex config import/mutation and no blanket API-sized context.
- Traycer browser DOM automation passed, but screenshot/viewport requests timed out. Isolated headless Chrome supplied the inspected captures; no real browser profile was used. Canvas inline rendering is unavailable; the canvas remains a Task artifact.
- The user-requested dev window remains open on its previously loaded bundle; isolated Argon test windows exited. Review workers completed. Temporary test profiles may be cleaned only inside the owned test root recorded in `.claude/vscode-parity/argon-host-root.txt`; receipt is copied beside that pointer.
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
