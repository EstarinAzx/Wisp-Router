---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**2.0.14 shipped.** Three commits on `main` (pushed, tag `v2.0.14`, release.yml
green, `wisp-router@2.0.14` on npm): `52c878e` purple statusline badge (xterm 141
≈ TUI accent `#a78bfa`; wisp-slot 1.1.2, plugin cache updated) · `153bfeb` Bridge
screen recommends the wisp-slot plugin · `de70b3b` release prep + **new
`packages/tui/CHANGELOG.md`** seeded 2.0.11–2.0.14. Verified: tsc, tui tests 13,
span-baseline recaptured (32 Screens), sandboxed routing CLI + statusline fixture.

## Next task

**None queued.** Candidates: backlog #68/#69, or a fresh `/preset init` idea.

## Landmines

- **Changelog split is now policy:** `v2.x` release prep updates
  `packages/tui/CHANGELOG.md`; the vscode changelog is extension-only
  ([[2026-07-17-wisp-router-gets-its-own-changelog]]).
- Span baseline embeds the version string — any `packages/tui/package.json`
  bump drifts all 32 Screens; recapture with `bun scripts/span-baseline.tsx
  --update` as part of release prep.
- `plugins/slot/**` edits need `claude plugin update wisp-slot@wisp-router`
  (statusline badge exempt — wrapper runs from checkout).
- Elucidate's badge is also purple — eyeball a bridged session; if the two
  purples read the same, shift the wisp shade.
- Tag must equal `packages/tui/package.json` version or release.yml refuses.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-17-wisp-router-gets-its-own-changelog]]
