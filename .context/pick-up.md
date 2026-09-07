---
type: pick-up
project: wisp
updated: 2026-09-07
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**The terminal bug hunt is complete locally.** Fix commit `d32869a` was fast-forwarded into local `main`: both terminal Bridge hosts persist logs, failed starts preserve the active log, log followers survive rotation and startup races, and routing recognizes Antigravity sign-in. Independent review has no remaining findings. Verified: 1,066 core tests, 39 terminal tests, typechecks/build, and an isolated real `serve` smoke check.

## Next task

No implementation remains. The local patch is ready for a release when requested. Inspect `git log --oneline origin/main..main` first: this session's fix and handoff commits are local only. The installed release remains Wisp 2.1.2 / VS Code 1.13.6. See [[release-follow-ups]] for the remaining candidates; do not re-open the two terminal bugs fixed here.

## Landmines

- Keep unrelated `.context/flows.md` edits and `.context/Untitled.canvas` out of automatic commits.
- Before another ticket branch, reconcile local `main` with `origin/main`; these commits have not been pushed.
- The fix branch `fix/terminal-bridge-bug-hunt` and Traycer-managed worktree are retained; paths and review evidence are in [[active-work]].
- The previously observed saved Codex bearer 401 was not investigated in this task. Use normal sign-in if it persists; do not copy or rotate shared tokens blindly.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
