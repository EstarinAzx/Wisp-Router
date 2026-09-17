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

The first Wisp 2.2.0 / VSIX 1.14.0 candidate passed automated review/package/native CI, but actual desktop inference failed. Picker and login worked. **Release is held; captured-request compatibility repairs are active.** The test integration was disabled, both temporary hosts stopped, and the user confirmed normal native GPT chat works again.

The user explicitly authorized unattended implementation, verification and the new release. Routine design/commit/push/release approval is already granted. Do not ask for that again; obtain only missing actual UI evidence, then finish the release.

## State

- **Draft PR:** https://github.com/EstarinAzx/Wisp-Router/pull/223 . Feature worktree: `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/feat-codex-desktop-signed-in`.
- **Implementation:** signed Bridge path plus persistent Alias/native catalog; enable/status/refresh/disable with conflict-safe recovery; native credentials isolated from external targets; user exact routes preserved; fixed native destination and redirect refusal.
- **Review PASS:** implementation at `0e4b984`, exact local packages at `a342a64`, build-only PR workflow at `6d28817`, test-only macOS fixture repair at `5de5b5c`. No unresolved reviewer finding.
- **Checks:** core 1168 tests, TUI 112/422 assertions, typechecks/builds, actual CLI 0.154.0 signed account/catalog/text/tool/routing/cancellation using synthetic fixtures, and exact Windows/npm/VSIX archive checks passed. Version dispatch had an additional focused 11/62 check.
- **Native CI PASS:** https://github.com/EstarinAzx/Wisp-Router/actions/runs/35189140842 . All four native builds and both smoke checks passed; publish was SKIPPED by design. Downloaded ZIP digests verified against GitHub, binary hashes recorded; downloaded Windows bytes passed both smoke checks.
- **In flight:** builder `5011a81c` and evaluator `ddab1276` are implementing/reviewing the revised phase-2 compatibility contract. Diagnostic-only fixes passed at `f738a06`; semantic fixes/new candidate/CI remain. No release/tag/global install. Integration is disabled; user restored GPT-5.6-Sol/medium. Existing Wisp routes are unchanged.

## Pick up here

Finish revised desktop-repair/phase-2 implementation and independent review, then build fresh candidates and re-run native CI before another live UI check. Captured shape14 proves unused hosted web_search, effort none and positioned developer instructions; no service_tier. Do not consolidate developer positions for Antigravity: preserve its routes for existing clients but report/exclude unsupported desktop targets. Use ordinary native-client discovery in native mode, no bundled-only union or temporary shared-config stripping; snapshots may support Alias refresh. Restore Wisp-only default selection narrowly on disable with action-required notices. Parent owns temporary test Alias/live activation, with peer model work paused. For the next real external test, existing Grok4.6 answered a fixed marker; OpenCodeGo/KimiK3 returned401. After successful live acceptance, finalize release wording, verify changed package bytes, integrate/publish and verify downloads. Both terminal2.2.0 and VSIX1.14.0 must ship; Slot unchanged.

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

Actual fresh desktop request shape is known and user normal-native baseline is restored. Repaired live inference/restart/rollback still need acceptance. Installed Store app26.908.9136.0, global CLI0.154.0; Computer Use pipe is unavailable. Structural evidence is D:/wisp-release-candidate-2.2.0-20260917/desktop-acceptance/request-shape-14.json. No prompts/headers/tool arguments/credentials were recorded. Do not repeat capture or ask for API keys in chat.

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
