---
type: pick-up
project: wisp
updated: 2026-09-08
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Next: [#211 — package and verify codex-wisp 2.1.4](https://github.com/EstarinAzx/Wisp-Router/issues/211), under [spec #208](https://github.com/EstarinAzx/Wisp-Router/issues/208).** Autonomous `vibe init` and relay are authorized. #210 landed via [PR #213](https://github.com/EstarinAzx/Wisp-Router/pull/213), squash `169a8c7`; #209 is also closed.

Read `.claude/relay/codex-wisp-2.1.4.traycer.json` in the main checkout before starting. Coordinator owns dispatch. Resume only the recorded assignment; historical Claude relay files are unrelated.

Read `docs/codex-wisp.md` and full #211. Source fidelity is complete. Gate: 1,139 core tests, 85 terminal tests, both typechecks, extension build, seven native cases and clean independent review. Evidence/worktree pointers are in [[active-work]]. Create the #211 branch from updated origin/main after dispatch.

## Landmines

- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` outside commits.
- #211 prepares local compiled/npm 2.1.4 artifacts; no tag, publication, global installation, credential repair or runtime restart.
- Preserve native model selection, visible output and image history. Unknown-model fallback uses `reasoning.summary: "auto"`.
- Wisp 2.1.3 remains installed; VS Code remains 1.13.6. Saved bearer 401 and TLS-chain issues remain separate.
- Context commits belong on main. Synchronize main/origin before subsequent branches.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
- [[2026-09-08-codex-wisp-native-contract-before-implementation]]
