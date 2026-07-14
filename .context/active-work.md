---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: fcc0eb0 on `main`, pushed. Tags v2.0.0 (dead, deprecated on npm) + v2.0.1 (live)._

## Current focus
**Repo housekeeping session (post-#67).** No feature work — README overhaul, doc purge, test
relocation. The critical path (#58→#67) remains complete; `wisp-router@2.0.1` live on npm.

## State
- **Done this session (commits 60c06d9, fcc0eb0):**
  - **README overhaul:** root README rewritten — `docs/wisp.png` banner (centered, width 560),
    npm/release badges, What-is-Wisp, Install (npm + vsix), Highlights, layout table, dev
    commands, release flow. Stale test count (304→367) fixed.
  - **Doc purge:** `PRD.md`, `issues.md`, `CODEX-STREAM-CUTOFF-FINDINGS.md` deleted — GitHub
    issues + git history are canonical now. `.context/overview.md` refs updated.
  - **Tests out of src:** `packages/core/src/*.test.ts` → `packages/core/tests/` (9 files),
    imports rewritten `./x` → `../src/x`, tsconfig test-exclude dropped (include stays `["src"]`).
    Vitest default glob finds `tests/` — no vitest config needed. Suite 367/367, typecheck clean.
  - **Repair:** 60c06d9 staged the test renames but NOT the sed import rewrite (sed ran after
    `git mv`, never re-staged) — main was briefly broken; fcc0eb0 fixed it (verified via
    `git grep "from './" fcc0eb0 -- packages/core/tests` → empty).
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
Next is user's choice from backlog: **#68 (chat mode)** or **#69 (copilot-wisp)**.
Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`;
VS Code extension 1.7.0 release (CHANGELOG has an Unreleased section with aliasOnlyModels);
root `.vsix` pile (13 tracked files) — user hasn't said whether to purge.

## Skills for next session
- /preset scope — entry gate for whichever backlog ticket is picked.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.
- (carried) npm platform packages were spam-removed once — probe
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming CI; the shim's release-download fallback keeps installs working.
- (carried) npm token was pasted in-session previously — user should rotate it (repo secret `NPM_TOKEN`).
- (carried) Codex signed out on this machine — `/signin codex` before Codex live checks.

## Recent context
- Ticket shape: #58–#65 ✅, #67 ✅ (critical path COMPLETE); backlog #68/#69.
- Release flow: bump `packages/tui/package.json` version → tag `v<same>` → push tag; workflow
  verifies tag==version, builds 4 targets, releases, publishes. Re-runs safe (skip-if-exists).
- Tests: `bun run test` at root → `packages/core/tests/` (367). Core typecheck ignores tests.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).

## Related
- [[overview]] — PRD/issues refs removed; tests path updated
- [[stack]] — tests moved to packages/core/tests
- [[decisions]] — no new entry this session (housekeeping only)
- [[gotchas]] — tests-path mention refreshed
- [[pick-up]]
