---
type: pick-up
project: wisp
updated: 2026-09-08
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Next: [#210 — content and Provider fidelity](https://github.com/EstarinAzx/Wisp-Router/issues/210), under [spec #208](https://github.com/EstarinAzx/Wisp-Router/issues/208).** The user authorized autonomous `vibe init` and relay. #209 landed through [PR #212](https://github.com/EstarinAzx/Wisp-Router/pull/212), squash `da6bc5a`.

Read `.claude/relay/codex-wisp-2.1.4.traycer.json` in the main checkout before spawning. Resume its recorded run/worker; historical `.claude/relay/*.md` files are unrelated stopped Claude runs.

Read `docs/codex-wisp.md` and the full #210 contract. The source path, tool registry, strict stream statuses and launcher are working; images/non-text parts remain explicitly rejected for #210 to extend. Baseline: 1,093 core +85 terminal tests, both typechecks, extension build, six native CLI cases and independent review pass. #211 follows; skip parent #208 as a work item. Worktree/evidence pointers are in [[active-work]].

## Landmines

- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` outside commits.
- Prepare reviewed source and local 2.1.4 artifacts; no release tag, npm publication, global installation or credential repair.
- Preserve native model metadata. Assert visible output and complete output items; exit zero is insufficient.
- Wisp 2.1.3 remains installed; VS Code remains 1.13.6. Saved bearer 401 and TLS-chain problems are held separately.
- Context commits belong on main. Synchronize main/origin before subsequent ticket branches; do not sweep unrelated history into a squash.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
- [[2026-09-08-codex-wisp-native-contract-before-implementation]]
