---
type: active-work
project: wisp
updated: 2026-09-08
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-08 by GPT-6 Astra / Codex (auto)_
_Release source: `d3fcca682acc3d8e300ba414204977422e66ecca`, tag `v2.1.4`_

## Current focus

**Wisp terminal/npm 2.1.4 and the Wisp 1.13.7 VSIX are published and verified.** Release work is complete. The user requested the release, not installation; installed terminal 2.1.3 and extension 1.13.6 remain unchanged.

## State

- **Published:** [release v2.1.4](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.1.4), four platform binaries and `wisp-1.13.7.vsix`. [Workflow 34180770927](https://github.com/EstarinAzx/Wisp-Router/actions/runs/34180770927) passed all four native build/smoke jobs and publication.
- **npm:** exact `wisp-router@2.1.4` metadata and `latest: 2.1.4` confirmed; all four scoped platform packages expose 2.1.4. Published shell contains all three commands and matching platform pins.
- **Verified:** five downloaded GitHub assets match their SHA-256 digests. npm shell and Windows platform archive match SHA-512 integrity; its binary matches the GitHub Windows asset. VSIX JSON/XML versions are 1.13.7.
- **Checks:** fresh 1,139 core tests, 86 terminal tests, both typechecks, extension compile/package and release metadata review passed. Downloaded Windows/npm smoke and native custom/discovery roundtrips passed. Earlier seven-case source/compiled/npm coverage remains recorded.
- **In flight:** none. Implementation spec #208 and #209–#211 are closed; the implementation relay is stopped and all worker/reviewer agents are archived.
- **Not installed:** no global package/VSIX installation, runtime restart, credential repair or TLS changes were performed.

## Pick up here

No further release task is queued. Install the published versions only if the user requests it. Use the published downloads, not the earlier local preparation binaries:

`D:/.claude/claude projects/autocomplete_extension/out/release-2.1.4-published/`

It contains five release assets, npm shell/Windows archives, `metadata.json`, `verification.json`, extracted npm packages and the runnable `verify.py`. Published native-check report: `out/codex-native-2026-09-08T02-51-21-114Z/REPORT.md`.

Release evidence: `C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/wisp-2-1-4-release/index.md`. The retained source worktree is on `release/2.1.4`; its older local build artifacts remain available for comparison.

## Skills for next session

- `preset pick-up` — rehydrate and inspect actual installed/runtime state before installation.
- `verification-before-completion` — verify installed bytes and launcher behavior if installation is requested.

## Open questions

No release blocker remains. Installation is pending user instruction. VS Code Marketplace publication was not performed; 1.13.7 is available as a GitHub VSIX.

## Recent context

- The release workflow rebuilds the extension, so its manifest and workspace lock were bumped to 1.13.7 instead of attaching changed core under 1.13.6. No runtime code or dependencies changed for the release cut.
- Native Codex tests use Windows and simulated Providers with a source-hosted Bridge; downloaded compiled Bridge HTTP smoke is separate. Native Codex/live-provider acceptance on macOS/Linux is not claimed by their successful build/smoke jobs.
- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` out of commits. Saved routes, credentials, permissions, browser settings and TLS were preserved.
- The saved Wisp Codex bearer 401 and local Node TLS-chain concern remain held separately; do not copy tokens or relax TLS to install. See [[release-follow-ups]].

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
- [[release-follow-ups]]
