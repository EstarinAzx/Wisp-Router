---
type: active-work
project: wisp
updated: 2026-09-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-17 by GPT-6 Astra / Codex (auto)_
_Stable release: 2.1.5. Candidate source: `5de5b5c3e1fbe26c3f7d44dbbf94f7092d5da6e0` on `feat/codex-desktop-signed-in`._

## Current focus

Wisp 2.2.0 / VSIX 1.14.0 signed-in desktop support is implemented, independently reviewed, packaged, and green on four-platform native CI. **Not released or activated globally.** The only pre-publication acceptance still missing is the actual desktop account/picker/selected-route/restart/rollback check; the automation helper cannot connect.

The user explicitly authorized unattended implementation, verification and the new release. Routine design/commit/push/release approval is already granted. Do not ask for that again; obtain only missing actual UI evidence, then finish the release.

## State

- **Draft PR:** https://github.com/EstarinAzx/Wisp-Router/pull/223 . Feature worktree: `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/feat-codex-desktop-signed-in`.
- **Implementation:** signed Bridge path plus persistent Alias/native catalog; enable/status/refresh/disable with conflict-safe recovery; native credentials isolated from external targets; user exact routes preserved; fixed native destination and redirect refusal.
- **Review PASS:** implementation at `0e4b984`, exact local packages at `a342a64`, build-only PR workflow at `6d28817`, test-only macOS fixture repair at `5de5b5c`. No unresolved reviewer finding.
- **Checks:** core 1168 tests, TUI 112/422 assertions, typechecks/builds, actual CLI 0.154.0 signed account/catalog/text/tool/routing/cancellation using synthetic fixtures, and exact Windows/npm/VSIX archive checks passed. Version dispatch had an additional focused 11/62 check.
- **Native CI PASS:** https://github.com/EstarinAzx/Wisp-Router/actions/runs/35189140842 . All four native builds and both smoke checks passed; publish was SKIPPED by design. Downloaded ZIP digests verified against GitHub, binary hashes recorded; downloaded Windows bytes passed both smoke checks.
- **In flight:** no build/test shell; no publication/tag. Peers are finished. Live Codex/Wisp configuration, routes, auth and installed apps are unchanged by this work.

## Pick up here

Complete the human-observed desktop check before marking PR ready, merging, tagging or publishing. Then update candidate/pending release wording, recheck any changed package bytes, integrate reviewed source, publish with the normal tag workflow and verify downloaded assets/npm metadata. Both terminal 2.2.0 and exact VSIX 1.14.0 must ship; Slot is unchanged. Recheck tag/version availability first.

The manual check and all evidence are linked from:

`C:/Users/S.D/.traycer/epics/1702a7c7-a431-43c2-ab5f-79d9cf189643/artifacts/autobuild/wisp-desktop/release-control/index.md`

- Desktop steps: sibling `desktop-acceptance/index.md`.
- Exact candidate bytes/helper: `D:/wisp-release-candidate-2.2.0-20260917/a342a64/`. `acceptance-and-rollback.ps1` validates EXE hash and supports status/serve/enable/refresh/disable. Status was checked against live homes and reported disabled. Do not rebuild over finalized artifacts.
- CI evidence: `D:/wisp-release-candidate-2.2.0-20260917/ci-35189140842/verification.json`; runnable downloader/verifier is `verify-native-ci.py` one level above.
- Architecture/usage: feature worktree `docs/codex-desktop.md`, `docs/releases/v2.2.0.md`; source audit remains `docs/investigations/codex-desktop-signed-in-routing.md`.

## Skills for next session

- `preset pick-up` / `verification-before-completion` - resume from exact evidence and finish release.
- `computer-use` only if its helper becomes available; never substitute CLI protocol tests for UI acceptance.
- `finishing-a-development-branch` / release workflow - existing user authorization covers integration/publication after gates.

## Open questions

Only observed desktop behavior remains unknown. Installed Store app26.908.9136.0, global CLI0.154.0; direct Store CLI execution returned Access is denied. Computer Use native pipe failed after retry/reset. Do not bypass ACL/security or change tool settings to obtain the test.

## Recent context

- Shared CODEX_HOME activation affects all Codex clients using it. Finish active Codex work before enabling; use fresh acceptance chats because explicit external overrides cannot replay arbitrary opaque native history.
- Live Wisp Alias `custom model` targets Antigravity; exact `gpt-5.5` routes to xAI. Preserve these. GPT-5.2 is a visible bundled native ID without a Wisp override, suitable for the native control if shown by Desktop.
- Existing npm Wisp2.1.5 and extension folder1.13.7 were observed. Default Bridge41184 did not answer the status probe; do not terminate an unidentified host. Use the reviewed candidate host for acceptance.
- macOS CI failure was fixture-only: copying Node separated it from @rpath/libnode dylibs (137 on arm64,127 on Intel). Native rerun diagnostics proved SIGABRT for copied runtime and exit0 in place. All product assertions remain.
- Preserve user-owned `.context/flows.md`, `.context/Untitled.canvas`, worktrees and prior release evidence. #215-#218 and Wisp2.1.5 release remain complete.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[release-follow-ups]]
