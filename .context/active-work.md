---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Fable 5 (auto)._
_At commit: `993e58b` on `main` (in sync with `origin/main`; tag `v2.0.7` pushed)._

## Current focus
**wisp-router 2.0.7 released and VERIFIED** (npm thin shell + all 4 platform packages +
GitHub release assets live). This session: /routing narrow-terminal wrap (WrapSelect), the
one-tap "Bind Claude subscription models" row, README tech-stack badges, bump + tag `v2.0.7`.

## State
- **/routing narrow-terminal fixes DONE** (`a07a4ce` + `0180a68`), probe-verified headless at
  50 and 40 cols, user eyeballed and passed:
  - Long chrome copy hand-wraps via `wrapWords(text, cols)` (opentui's own `wrapMode="wrap"`
    still garbles — see [[opentui-rows-garble-on-small-terminals-without-wrapmode-none-and]]).
  - The three /routing dropdowns use the hand-rolled **WrapSelect** (in `packages/tui/src/app.tsx`)
    instead of the native select: wrapped descriptions, windowed view (`maxRows`), dim
    "… N more" markers instead of the scroll bar.
  - The status/feedback line wraps via wrapWords too.
- **"Bind Claude subscription models"** (`a07a4ce`): bottom row of Routing — Claude Code.
  Signed in → all four families → anthropic (opus-4-8 / sonnet-5 / haiku-4-5 / fable-5) in one
  write; signed out → browser sign-in first, bind on token landing (startSignIn grew an
  optional onSuccess). Mapping is TUI-local `CLAUDE_FAMILY_MODELS`; promote to core if the
  side panel ever wants the button. `claude-fable-5` added to core's curated ANTHROPIC_MODELS.
- **README** (`a4f8281`): two badge rows (npm/release/platforms + TS 7/Bun/React 19/
  VS Code ≥1.104/Vitest), test count fixed to 434.
- **Release 2.0.7** (`993e58b` + tag `v2.0.7`): run 29474723621 fully green — verified
  `wisp-router@2.0.7` on npm, all 4 platform packages, GitHub release with 4 binaries.
- **Gate GREEN:** tui `tsc` + 434 core tests + headless probes + user eyeball.

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
- Headless probe caveat (bit this session): `useKeyboard` subscriptions are passive effects —
  they land a macrotask AFTER the frame commits. In probes, poll with real `setTimeout` timers
  between keypresses; `waitForFrame` alone presses keys before a fresh screen has subscribed.
  Full recipe in the gotcha entry.
- WrapSelect windowing: variable-height items, selection kept visible, `key={mode.section}`
  guards stale selection across section toggles.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
