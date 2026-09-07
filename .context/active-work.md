---
type: active-work
project: wisp
updated: 2026-09-07
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-07 by GPT-6 Astra / Codex (auto)_
_At release commit: `12e638f`, tag `v2.1.3`_

## Current focus

**Wisp 2.1.3 is released, verified, and installed.** The terminal bug-hunt patch is shipped. VS Code remains 1.13.6 and wisp-slot is unchanged; this patch only changes the terminal package.

## State

- **Published:** source and annotated tag pushed. All five [release jobs](https://github.com/EstarinAzx/Wisp-Router/actions/runs/34105343246) passed. The [release](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.1.3) contains four platform binaries and the existing 1.13.6 VSIX. Exact npm version metadata and its archive serve 2.1.3; a fresh metadata request confirms `latest: 2.1.3`.
- **Verified:** 1,066 core tests, 39 terminal tests, core/terminal typechecks, extension build, and independent implementation review passed. The locally built, downloaded, and installed Windows binaries each passed seven isolated executable probes. The published 2.1.2 control failed five repaired cases. Downloaded/installed binary SHA-256 matches GitHub; npm archive SHA-512 matches registry metadata. Both launchers passed clean-install and global-install checks.
- **Installed:** global `wisp-router@2.1.3`, with the verified Windows binary at `C:/Users/S.D/.wisp/bin/v2.1.3/wisp.exe`. The standard Node downloader failed `unable to verify the first certificate`; the validated GitHub CLI download populated its existing version cache. No TLS settings changed.
- **Runtime:** no Wisp process or listener on port 41184 remained after checks. No user host needed restarting. Saved routes, credentials, providers, and plugin configuration were preserved.
- **Git:** implementation `d32869a`, release `12e638f`; retained fix branch/worktree remain available. Unrelated `.context/flows.md` and `.context/Untitled.canvas` edits remain outside commits.

## Pick up here

No active work. No ready-for-agent issue was open at the cut; re-query before selecting work. Remaining candidates and carried risks live in [[release-follow-ups]]. The TUI Bridge file-log and Antigravity routing-warning candidates are now shipped.

## Evidence

Release report: `C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/wisp-2-1-3-release/index.md`.
Independent review: sibling artifact `terminal-bug-hunt-review/index.md`.
Re-runnable probes and downloaded artifacts: `out/release-2.1.3/` in the main checkout (gitignored).

## Recent context

- The user explicitly requested release and installation after the autonomous bug hunt. No new features or provider-wire changes were added for the release.
- npm's normal version-list cache still returned 2.1.2 despite the live exact-version endpoint and archive. Installation used the checksum-verified published archive. A fresh metadata URL confirms 2.1.3 is latest; do not infer a failed publication from the stale cached response.
- New probes used temporary WISP_HOME directories and synthetic credentials. No live provider turns or authentication repair were needed.
- Shared ecosystem runtime notes were updated. Health: skills audit 0; template differences 9; age-only vault flags 4 ecosystem, 38 BCDE311, 21 BCDE321; no structural vault errors. Traycer vault is clean. The Codex adapter check stops because current project trust includes an additional unrelated project absent from its saved baseline; trust settings were preserved. Details are in the release report.
- The saved Codex bearer 401 from the earlier cache investigation remains a separate held concern.

## Related

- [[overview]]
- [[decisions]]
- [[pick-up]]
- [[release-follow-ups]]
- [[2026-09-07-codex-cache-identity-and-ordered-notes]]
- [[2026-09-06-codex-discovery-is-account-metadata-ultra-is-orchestration]]
