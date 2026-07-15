---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**Released `wisp-router@2.0.5` — Grok (xAI OAuth) provider epic #91 fully done.**
- Merged PR #105, rebased the local wrap-up context commit onto origin, tagged `v2.0.5` → `bee49c6`,
  pushed. `release.yml` run `29406040823` **GREEN**.
- npm: `wisp-router@2.0.5` + all 4 scoped platform pkgs live; shell optionalDeps pinned to 2.0.5;
  GitHub release created. Epic **#91** + issue **#98** closed.
- Recorded in [[active-work]] (State + Landmines).

## Next task
**No committed next task — ready queue is empty, epic #91 done.** Pick from the carried backlog
(top candidate first):
1. **VS Code extension 1.7.0** — ship the Grok face to *extension* users (the npm/TUI 2.0.5 release is
   out; the extension is still v1.6.0, CHANGELOG `[Unreleased]` already holds the Grok entry). Separate
   release path from `release.yml`.
2. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
3. **Panel-side alias rename** — TUI-only follow-up.

Or verify the one open loose thread: **grok-4.5 billing** (SuperGrok vs metered) — untestable from here,
needs the human's xAI account.

## Landmines
- **Release rebase trap (bit us this release):** wrap-up commits `.context/` locally but doesn't push it;
  next session that commit diverges from the PR squash-merge on origin. **Rebase local `main` onto
  `origin/main` and tag the version-bump commit**, not the context commit. `release.yml` guards
  tag==`packages/tui` version, so a wrong tag fails loud.
- **npm publish is irreversible** — 2.0.5 is spent; next npm release is 2.0.6+.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave the `id:'groq'` row alone.
- Codex signed out on this machine (`/signin codex` before any Codex live checks).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
