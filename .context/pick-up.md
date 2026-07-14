---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#67 landed — wisp-router 2.0.1 is PUBLIC on npm** (main `c3155cc`, tag `v2.0.1`; #67 closed;
critical path #58→#67 complete). `Release` workflow: tag `v*` → 4-target `bun build --compile`
matrix → GitHub release with binaries → npm publish (thin shell `wisp-router` + scoped
`@tsd47216/wisp-router-<target>` platform packages, shim falls back to the release download).
Bonus shipped: `bridge.aliasOnlyModels` (panel checkbox + TUI `/aliasonly`) — Claude Code's
`/model` list shows only Aliases. TUI polish shipped (no `▶` indicator, no input border title,
`Wisp_` splash + version). Suite 367/367. Install verified (`npm i -g wisp-router`); dev shims
in `~\.local\bin` **deleted** — the real npm bins now serve `wisp`/`claude-wisp`.

## Next task
Critical path done — **user picks from backlog: #68 (chat mode) or #69 (copilot-wisp)**.
Suggested: `/preset scope <picked>`. Small orphans available anytime: add LICENSE + `license`
fields to `packages/tui/npm/*/package.json`; VS Code extension 1.7.0 release (CHANGELOG already
has an Unreleased section with aliasOnlyModels).

## Landmines
- **npm spam filter:** the platform packages were REMOVED once minutes after a green publish
  (unscoped names 403'd outright). Before blaming CI, probe the registry:
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`.
  Fallback keeps installs working; reinstatement = npm support ticket (user action).
- **Version numbers burn on contact:** 2.0.0 is deprecated and can never be republished. Release
  flow: bump `packages/tui/package.json` → tag `v<same>` → push (workflow enforces tag==version;
  re-runs skip already-published/existing steps).
- **User should rotate the npm token** — it was pasted in-session; live copy is repo secret
  `NPM_TOKEN`.
- `macos-13` runner label is retired — darwin-x64 builds on `macos-15-intel` (until Aug 2027).
- Codex signed out on this machine — `/signin codex` before Codex live checks (`--model haiku` →
  `opencode-go` works meanwhile).
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes
  real `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
