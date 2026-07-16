---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Fable 5 (auto)._
_At commit: `cb7007a` on `main` (in sync with `origin/main`; tag `v2.0.9` pushed)._

## Current focus
**wisp-router 2.0.9 released and VERIFIED** (npm thin shell + all 4 platform packages +
GitHub release assets live; run 29479110590 green). Contents: the `/providers` submenu hub
(#106), palette description wrap on narrow terminals, and the Advisor endpoint-gate warning
on `/bridge`.

## State
- **#106 provider submenu DONE** (`4918cf8`, closed the issue): Enter on a `/providers` row
  opens its action menu — Use as Active Provider (first row) · Set API key / Remove key
  (keyed; remove only when a stored key exists — new capability) · Sign in / Sign out (OAuth,
  live status). Actions land back on the list; Esc steps one level; `/key` `/signin`
  `/signout` untouched. Keyed list rows now show `key set` / `env key`. All in
  `packages/tui/src/app.tsx`; user eyeball-passed.
- **Palette wrap** (same commit): suggestion rows that don't fit hand-wrap into command line
  + indented dim description lines (wrapWords, same rule as WrapSelect).
- **Advisor warning** (`9442718`): `/bridge` panel warns Advisor won't work through Wisp even
  bound to Claude OAuth — endpoint-gated upstream, no code fix; see
  [[claude-code-advisor-is-endpoint-gated-past-the-bridge]].
- TUI `tsc` clean; core suite 434/434 (engine untouched).
- Spec lives as GitHub issue #106 (closed by the feature commit).

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty. Carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
   **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. **Panel-side alias rename** — TUI-only follow-up.
3. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
4. **catalog.ts someday-9 remainder** — deferred, low payoff.

## Skills for next session
(none clearly apply — top item is a human step)

## Open questions
- (carried) grok-4.5 on public `api.x.ai`: SuperGrok vs metered billing unverified.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- User's installed wrapper: update with `npm i -g wisp-router@2.0.9` — once ≥ 2.0.8 the
  `$env:CLAUDE_BINARY` profile export is droppable (launcher sets it on the child).

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
