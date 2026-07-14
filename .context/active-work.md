---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: c3155cc on `main`, pushed. Tags v2.0.0 (dead, deprecated on npm) + v2.0.1 (live)._

## Current focus
**#67 landed — wisp-router is PUBLIC.** `wisp-router@2.0.1` is live on npm (bins `wisp` +
`claude-wisp`), the `Release` workflow (tag `v*`) builds the 4-target matrix
(win32-x64 / darwin-arm64 / darwin-x64 / linux-x64) via `bun build --compile`, attaches binaries
to the GitHub release, and publishes npm. Install verified on this machine
(`npm i -g wisp-router` → both bins work); dev shims in `~\.local\bin` deleted. #67 closed.
The critical path (#58→#67) is complete.

## State
- **Done this session (commits f44cfb2, ba58992, 721ed4d, c3155cc; tag v2.0.1):**
  - **Release pipeline:** single compiled binary dispatches on argv (`serve` / `claude-wisp` /
    else TUI); npm thin shell `packages/tui/npm/wisp-router` (JS shims) over 4 platform packages
    `@tsd47216/wisp-router-<target>` (optionalDependencies), **plus a GitHub-release download
    fallback in the shim** (`~/.wisp/bin/v<ver>/`) because npm's spam filter removed the platform
    packages once (see decisions). Platform publishes are best-effort in CI; the shell hard-fails;
    the GitHub release is created BEFORE npm publish so the fallback target always exists.
  - **Alias-only /models filter (bonus):** `bridge.aliasOnlyModels` (default off) — Anthropic
    door lists ONLY Aliases (Claude Code's picker); OpenAI door untouched. Panel checkbox + TUI
    `/aliasonly [on|off]` (refuses ON with zero aliases). Live-verified via sandboxed `wisp serve`.
  - **TUI polish (user screenshots):** selects drop opentui's hardcoded `▶ ` indicator
    (ambiguous-width glyph overlapped labels on Windows; highlight bar suffices), palette input
    box lost its `wisp` border title, splash reads **Wisp_** (block-underscore) +
    `BYOK model router · v2.0.1` (version from package.json import).
  - Suite **367/367**; both faces compile; user eyeballed the TUI — go.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
Critical path done — next is user's choice from backlog: **#68 (chat mode)** or **#69
(copilot-wisp)**. Also open (small): add a LICENSE + `license` fields to the npm manifests;
npm support ticket to reinstate the platform packages if they get spam-removed again.

## Skills for next session
- /preset scope — entry gate for whichever backlog ticket is picked.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.
- npm platform packages currently live but were spam-removed once minutes after a green publish —
  re-check `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
  before blaming the workflow. The shim's release-download fallback keeps installs working either way.
- The npm token was pasted in-session (also stored as repo secret `NPM_TOKEN`) — user should rotate it.
- Codex still signed out on this machine — `/signin codex` before Codex live checks.

## Recent context
- Ticket shape: #58–#65 ✅, #67 ✅ (critical path COMPLETE); backlog #68/#69.
- Release flow: bump `packages/tui/package.json` version → tag `v<same>` → push tag; the workflow
  verifies tag==package version, builds, releases, publishes. Re-runs are safe (skip-if-exists).
- `wisp`/`claude-wisp` on this machine now come from the npm install (`AppData\Roaming\npm`).
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; `WISP_HOME` to sandbox; BOM-free
  config.json if hand-seeded).

## Related
- [[overview]] — TUI published; /aliasonly added; release workflow
- [[stack]] — test count 367
- [[decisions]] — 2026-07-14 release-delivery entry
- [[gotchas]] — npm spam takedown; macos-13 retired; ambiguous-width glyphs
- [[pick-up]]
