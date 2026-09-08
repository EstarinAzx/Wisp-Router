---
type: pick-up
project: wisp
updated: 2026-09-08
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**queue empty** for Codex Wisp 2.1.4: #209, #210 and #211 are closed. Final [PR #214](https://github.com/EstarinAzx/Wisp-Router/pull/214) merged as `e23f1033602d00e4ea688c4aade8b4f233cea093`. Source and local Windows binary/npm artifacts are complete; release publication and installation remain pending.

Coordinator verifies the final evidence and closes parent [#208](https://github.com/EstarinAzx/Wisp-Router/issues/208). Read the live relay control file before acting; no successor worker is needed. Artifact paths/checksums and review are linked from [[active-work]].

## Landmines

- All checks passed: 1,139 core +86 terminal tests, both typechecks, extension build, compiled/npm smoke and seven native cases per launcher path.
- Windows/local mock coverage only. Native fixture uses a source-hosted Bridge; compiled Bridge smoke runs separately. Cross-platform release matrix and real-provider acceptance remain unrun.
- Publication/tag/global installation/runtime restart/credential repair are outside the completed preparation scope.
- Installed Wisp 2.1.3 and extension 1.13.6 are unchanged. Rebuilt extension source includes new core and needs a separate release-version decision. Slot is unchanged.
- Preserve retained worktree artifacts and user-owned `.context/flows.md` + `.context/Untitled.canvas`. Stage context paths explicitly on main.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
- [[2026-09-08-codex-wisp-native-contract-before-implementation]]
