---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Opus 4.8 (auto)._
_At commit: `645f86d` on `main` (in sync with `origin/main`)._

## Current focus
**Nothing in flight.** This session fixed the TUI's small-terminal garbling (two commits,
`f5ec8bf` + `645f86d`, both on origin) and gave every panel a shared facelift. User eyeballed
and passed. Ready queue empty; next work from the carried backlog below.

## State
- **TUI small-terminal fix DONE + shipped to origin.** Two distinct opentui failure modes,
  both fixed in `packages/tui/src/app.tsx` and probe-verified headless:
  see [[opentui-rows-garble-on-small-terminals-without-wrapmode-none-and]].
  - `f5ec8bf` — `wrapMode="none"` on chrome rows (wrap → overlay garble on narrow terminals);
    Persistent settings.json snippet block **removed from the TUI bridge panel** (claude-wisp
    is the connect path; VS Code side panel still renders the full snippet, core builder
    untouched); facelift: shared `PANEL` frame (rounded dim border `#52525b` + accent title)
    spread into all 18 panel boxes, aligned dim-label/accent-value columns in the bridge panel.
  - `645f86d` — `flexShrink={0}` on chrome rows + PANEL (short terminal → yoga shrinks rows to
    0 height but opentui still paints them → overlay garble; now clips cleanly at bottom).
  - Only real content still wraps: /test reply + its error text.
- **Gate GREEN:** tui `tsc` + 434 core tests + headless `testRender` smokes at 60 cols and
  heights 20/14 + user eyeball on a real shrunken window.

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty. Carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
   **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. **catalog.ts modularization — someday-9 remainder** (deferred, only if it earns it): split
   catalog's grab-bag further, repoint core siblings to per-concern imports, drop the
   re-export facade. Low payoff.
3. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.
5. (new, only if clipping ever annoys) **ScrollBox for the suggestion list** — bottom rows now
   hide on tiny windows instead of garbling; opentui has a ScrollBox renderable if scrolling
   is ever wanted.

## Skills for next session
(none clearly apply — backlog items are human-step / deferred)

## Open questions
- (carried) grok-4.5 rides the public `api.x.ai` lane — whether xAI bills it under SuperGrok or
  as metered API usage is unverified (untestable from here).
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- The TUI fix was probe-driven: `testRender` + `captureCharFrame` from `@opentui/react/test-utils`
  reproduced both garble modes headless in seconds — the recipe is in the gotcha entry.
- The TUI's `/bridge` panel no longer shows the settings.json snippet; if a user needs the
  persistent form, it lives in the VS Code side panel (same `buildClaudeCodeSnippets` builder).
- New TUI panel-chrome rule of thumb: every chrome row gets `wrapMode="none"` + `flexShrink={0}`
  (or rides `PANEL`); only real streamed content wraps.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
