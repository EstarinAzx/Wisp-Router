---
type: active-work
project: wisp
updated: 2026-09-08
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-08 by GPT-6 Astra / Codex (auto)_
_Release source: `e45cc9bd978b9549a792741fb41f1cfbd85034d7`, tag `v2.1.5`_

## Current focus

**Wisp terminal/npm 2.1.5 and companion VSIX 1.13.8 are published and verified.** The user explicitly requested no global installation; installed applications and running hosts were not changed.

## State

- **Published:** [release v2.1.5](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.1.5), four platform binaries and `wisp-1.13.8.vsix`. [Workflow 34199792853](https://github.com/EstarinAzx/Wisp-Router/actions/runs/34199792853) passed all four native build/smoke jobs and publication.
- **npm:** exact 2.1.5 metadata exists for the thin shell and all four scoped platform packages; `wisp-router` latest is 2.1.5.
- **Verified:** all five downloaded GitHub assets match published SHA256 digests. npm shell/Windows archives match SHA512 integrity, with identical Windows binary in npm and GitHub. VSIX JSON/XML version is 1.13.8 and its extension bundle matches the reviewed candidate bundle.
- **Fresh published-byte checks:** compiled/npm packaged smoke passes outside the checkout with empty child PATH. Downloaded compiled and npm launchers each pass alias image/effort/resume and live-route-edit native cases with listener closure.
- **Earlier implementation gate:** 1,147 core tests, 96 TUI tests / 335 assertions and 48 native source/compiled/npm cases passed, independently repeated. #215–#218 and relay are complete; all workers/reviewers archived.
- **Traycer:** GUI integration remains **NOT VERIFIED**. See `docs/investigations/traycer-codex-compatibility.md`.
- **In flight:** none. No publication step or relay successor remains.

## Pick up here

No active work — choose a new task. Installation requires a separate instruction. If requested, verify current installed/host ownership and use published downloads, not earlier local candidates:

`C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-215-codex-picker-aliases/out/release-2.1.5-published/`

`metadata.json` and `verification.json` own published digests/versions. `verify.py` downloads and checks assets without installing. `native-check.py` and `native-verification.json` reproduce the downloaded Windows/npm checks.

Release artifact: `C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/wisp-2-1-5-release/index.md`.

## Skills for next session

- `preset pick-up` — rehydrate and inspect actual runtime/install state for any new task.
- `verification-before-completion` — verify installed bytes if installation is requested.

## Open questions

Installation was explicitly excluded. VS Code Marketplace publication was not performed; 1.13.8 is a GitHub VSIX. Traycer needs a verified supported connection spanning GUI discovery and execution before claiming integration.

## Recent context

- Requests follow route edits live; catalog entries/capabilities refresh on launcher restart. Existing snapshots still cover Alias/Claude rows only.
- Bun 1.4.2 is the verified repository/build baseline; global Bun remains unchanged. Avoid old-runtime failure diagnostics, which left historical non-serving kernel-listener entries with no owned live process to terminate.
- Four-platform workflow smoke is not macOS/Linux native-conversation acceptance. Native matrices use a source-hosted Bridge; compiled Bridge smoke is separate. Installed VS Code and real-provider acceptance are not claimed.
- Preserve user-owned `.context/flows.md` and `.context/Untitled.canvas`, prior worktrees and all local/published release evidence.
- Credentials, TLS, provider settings, permissions and managed Traycer files were preserved. Held bearer/TLS concerns remain in [[release-follow-ups]].

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
- [[release-follow-ups]]
