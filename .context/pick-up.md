---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**TUI UX batch + 2.0.2 release (commits 716734f + 39ac79b, tag v2.0.2).** Slash palette got
Up/Down highlight selection (Enter runs the highlighted command; `/test` completes into the input);
header shows a green `bridge up :<port>` badge while the TUI hosts the listener; layout roomier
(padding 2, chunkier input bar). Aliases are now fully editable in the TUI: new core pure op
`withAliasRenamed` (keeps Target + position, refuses shadows/collisions; +2 tests → 369/369) wired
as a "Rename alias" entry in `/routing`'s per-row Provider picker. Version bumped to 2.0.2, tag
pushed — release workflow was in flight at session end.

## Next task
1. **Verify the release landed:** Actions green, `npm view wisp-router version` → 2.0.2. If a
   platform package 403'd, shim's release-download fallback covers it (see landmines).
2. Then user picks from backlog: **#68 (chat mode)** or **#69 (copilot-wisp)** — `/preset scope <picked>`.
Small orphans anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`; VS Code
extension 1.7.0 release (CHANGELOG Unreleased ready); root `.vsix` pile (ask before purging);
panel-side alias rename (TUI-only today).

## Landmines
- **TUI runtime not eyeballed this session** — typecheck + 369 tests only; the new palette UX has
  not been run in a real terminal. If something's off visually, it's in `packages/tui/src/app.tsx`.
- **Version numbers burn on contact:** if the 2.0.2 workflow failed BEFORE npm publish, fix + re-push
  the same tag (skip-if-exists makes re-runs safe); if npm publish succeeded partially, never reuse
  the version.
- **npm spam filter:** platform packages were REMOVED once post-publish. Probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI.
- **User should rotate the npm token** (pasted in an earlier session; repo secret `NPM_TOKEN`).
- Codex signed out on this machine — `/signin codex` before Codex live checks.
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes
  real `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- PowerShell 5.1 mangles multi-line `git commit -m` with quotes/`<` — use `git commit -F <file>`.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
