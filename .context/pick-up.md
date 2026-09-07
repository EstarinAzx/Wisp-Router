---
type: pick-up
project: wisp
updated: 2026-09-07
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Wisp 2.1.3 is released, verified, and installed.** Release source `12e638f`, tag `v2.1.3`; workflow `34105343246` passed all five jobs. The terminal logging, rotation, follower, and Antigravity-readiness fixes are live in the installed binary. VS Code remains 1.13.6; wisp-slot is unchanged.

## Next task

None queued at the cut. Re-query `gh issue list --label ready-for-agent --state open`. If empty, get the user's next task; [[release-follow-ups]] preserves the remaining held candidates. The two previously held terminal bugs are shipped and should not be re-opened.

## Landmines

- Keep unrelated `.context/flows.md` edits and `.context/Untitled.canvas` out of automatic commits.
- Node's fallback downloader failed certificate-chain validation. Installation used the checksum-verified GitHub binary in `~/.wisp/bin/v2.1.3/wisp.exe` and the integrity-verified published npm archive. TLS settings were preserved. See [[active-work]] for evidence.
- npm's ordinary version-list cache still showed 2.1.2 at the final check; the exact 2.1.3 endpoint, tarball, and fresh metadata endpoint confirm publication. The installed package is verified as 2.1.3.
- No Wisp process or Bridge listener on 41184 remained after the checks. The next Wisp launch uses the new version.
- The previously observed saved Codex bearer 401 remains uninvestigated. Use normal sign-in if it persists; do not copy or rotate shared tokens blindly.
- Before another ticket branch, verify `git rev-list --left-right --count origin/main...main` is `0 0`.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
