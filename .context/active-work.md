---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Fable 5 (auto)._
_At commit: 39ac79b on `main`. Tag v2.0.2 being pushed this session (release in flight)._

## Current focus
**TUI UX batch + wisp-router 2.0.2 release.** Bonus-scope session (backlog #68/#69 still
deferred): palette arrow selection, bridge status badge, roomier layout, alias rename.

## State
- **Done this session (commits 716734f, 39ac79b):**
  - **Palette selection:** Up/Down move a highlight through the slash-suggestion list (wraps),
    Enter runs the highlighted command; required-arg commands (`/test`) complete into the input
    (`/test `) instead of firing bare. Typing filters + resets the highlight.
  - **Bridge badge:** header shows green `· bridge up :<port>` while THIS TUI hosts the listener.
  - **Alias rename:** core gained pure `withAliasRenamed` (keeps Target + row position; refuses
    Provider-id shadow, collision with another alias, unknown old name) — `routing.ts`, +2 tests
    (369/369). TUI: `/routing` → alias row → Provider picker → "Rename alias" entry → input screen.
  - **Layout:** root padding 2, input bar with inner padding (chunkier), gap before suggestions.
    Real font zoom impossible in-app (cell renderer) — user does Ctrl+Plus in terminal.
  - **Release:** `packages/tui/package.json` → 2.0.2; tag v2.0.2 pushed → workflow builds
    4 targets, GitHub release, npm publish.
- **In flight:** the v2.0.2 release workflow (check Actions if npm badge stale).
- **Blocked:** nothing.

## Pick up here
First: confirm the v2.0.2 release workflow went green + `npm view wisp-router version` → 2.0.2.
Then user's choice from backlog: **#68 (chat mode)** or **#69 (copilot-wisp)**.
Small orphans, anytime: LICENSE + `license` fields in `packages/tui/npm/*/package.json`;
VS Code extension 1.7.0 release (CHANGELOG has an Unreleased section); root `.vsix` pile
(13 tracked files) — user hasn't said whether to purge. Panel alias RENAME (TUI-only for now)
is a candidate small ticket.

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
- Release flow: bump `packages/tui/package.json` version → tag `v<same>` → push tag; workflow
  verifies tag==version, builds 4 targets, releases, publishes. Re-runs safe (skip-if-exists).
- Tests: `bun run test` at root → `packages/core/tests/` (369). Core typecheck ignores tests.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).
- TUI runtime NOT eyeballed this session (typecheck + suite only) — user's screenshot was the old
  2.0.1 binary; CI smoke test covers boot, not the new palette UX.

## Related
- [[overview]] — routing.ts edit-ops line gained withAliasRenamed
- [[stack]]
- [[decisions]] — no new entry (rename op follows the settled #65 pattern)
- [[gotchas]]
- [[pick-up]]
