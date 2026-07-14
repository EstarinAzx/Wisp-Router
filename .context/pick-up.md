---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Housekeeping (commits 60c06d9 + fcc0eb0, pushed).** Root README rewritten around the
`docs/wisp.png` banner (badges, install, highlights, layout, dev, release). `PRD.md`,
`issues.md`, `CODEX-STREAM-CUTOFF-FINDINGS.md` deleted — GitHub issues + git history are the
record now. Tests moved out of src: `packages/core/src/*.test.ts` → `packages/core/tests/`
(imports rewritten to `../src/…`, tsconfig exclude dropped, vitest default glob covers it).
Suite 367/367; typecheck clean. Mid-session repair: 60c06d9 had staged the test renames without
the import rewrite (main briefly broken) — fcc0eb0 fixed and verified.

## Next task
Unchanged from last session — **user picks from backlog: #68 (chat mode) or #69 (copilot-wisp)**.
Suggested: `/preset scope <picked>`. Small orphans anytime: LICENSE + `license` fields in
`packages/tui/npm/*/package.json`; VS Code extension 1.7.0 release (CHANGELOG Unreleased section
ready); root `.vsix` pile (13 tracked files) — ask user before purging.

## Landmines
- **`git mv` + sed ≠ staged:** sed after `git mv` leaves the rewrite unstaged — `git add` the
  moved files again before committing (bit us this session).
- **npm spam filter:** platform packages were REMOVED once post-publish. Probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI; shim's release-download fallback keeps installs working.
- **Version numbers burn on contact:** 2.0.0 deprecated, never republishable. Release flow: bump
  `packages/tui/package.json` → tag `v<same>` → push (workflow enforces tag==version).
- **User should rotate the npm token** (pasted in an earlier session; repo secret `NPM_TOKEN`).
- Codex signed out on this machine — `/signin codex` before Codex live checks (`--model haiku` →
  `opencode-go` works meanwhile).
- Both faces share Bridge port + secret — second host fails loud; stop one first. TUI dev writes
  real `~/.wisp` — use `WISP_HOME` sandbox; hand-seeded config.json must be BOM-free.
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
