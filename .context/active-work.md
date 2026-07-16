---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Fable 5 (auto)._
_At commit: `81b3d52` on `main` (in sync with `origin/main`; tag `v2.0.8` pushed)._

## Current focus
**wisp-router 2.0.8 released and VERIFIED** (npm thin shell + all 4 platform packages +
GitHub release assets live; run 29475885120 green, ~2m). Contents: `claude-wisp` sets
`CLAUDE_BINARY=claude-wisp` on the spawned child (`8129879`), so `/relay` loops inside a
wisp-launched session respawn the wrapper instead of bare `claude`.

## State
- **CLAUDE_BINARY on child DONE** (`8129879`, pushed): added to core's pure `buildClaudeLaunch`
  env (trio → +1) in `packages/core/src/bridgeAnthropic.ts`; deliberately overrides any
  inherited value (session running under the wrapper ⇒ legs must too).
- TDD'd: test updated red-first in `packages/core/tests/bridgeAnthropic.test.ts`; 434/434 pass.
- **Smoke-tested end-to-end by the user**: Bridge up, `bun src/claude-wisp.ts`, child echoed
  `claude-wisp`.
- **Released as 2.0.8** (`81b3d52` + tag `v2.0.8`): verified `wisp-router@2.0.8` on npm, all
  4 platform packages, GitHub release with 4 binaries.
- Relay skill doc (`~/.claude/skills/relay/SKILL.md`, off-repo) noted: profile export
  `$env:CLAUDE_BINARY` only needed on wisp-router < 2.0.8 — droppable once the installed
  wrapper is updated to 2.0.8.

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty. Carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
   **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. **catalog.ts someday-9 remainder** — deferred, low payoff.
3. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Skills for next session
(none clearly apply — top items are verify/human steps)

## Open questions
- (carried) grok-4.5 on public `api.x.ai`: SuperGrok vs metered billing unverified.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- Relay's binary resolution order: state-file `binary:` → `$env:CLAUDE_BINARY` → wisp
  auto-detect → `claude`. The launcher env var slots in at step 2, so no profile export needed
  once ≥ 2.0.8 is the installed wrapper.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
