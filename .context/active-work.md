---
type: active-work
project: wisp
updated: 2026-07-19
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-19 by Opus 4.8 (1M) (wrap-up)._
_At commit: e31bcfc (release 2.0.23 tagged + pushed)._

## Current focus

**2.0.23 shipped** — TUI polish on `/show-log` + `/bridge` + drag-select copy.
Tag `v2.0.23` is on `main` (`e31bcfc`); `release.yml` was kicked by the push.
2.0.22 was already tagged/pushed earlier the same day (advisor fix).

## State

- **In flight:** watch `release.yml` for `v2.0.23` go green → npm `wisp-router@2.0.23` + GitHub assets.
- **Done this session:**
  1. Planned + built TUI 2.0.23 (user eyeball-passed):
     - `/show-log` hand-wraps long lines (`wrapWords`) so model ids no longer clip.
     - `[bridge] route …` lines render in sky `LOG_ROUTE` (`#38bdf8`); other traffic stays dim.
     - `/bridge` wisp-slot recommend blurb is gold `PLUGIN_NUDGE` (`#D59D24`).
     - Drag-select copies via OSC 52, `clip.exe` fallback on Windows (`clipboard.ts`).
  2. Tests: `logScreen.test.ts` (route classifier + wrapWords); tsc clean; 32-screen span baseline recaptured.
  3. Tagged + pushed `v2.0.23` (and the commit) to origin.
- **Blocked:** none.

## Pick up here

1. Confirm `release.yml` for `v2.0.23` is green; npm `wisp-router@2.0.23` published.
2. Optional: `npm i -g wisp-router@2.0.23` — **stop any running `wisp.exe` first** or the npm unlink fails (file locked).
3. No code pending after the release lands. Next work is a fresh task.

## Skills for next session

- `/preset ci-babysit` if the release run is still pending when you open.
- Otherwise drive normal.

## Open questions

- None for 2.0.23. Clipboard is OSC52-first + win `clip.exe`; other platforms with no OSC52 get a silent no-op until someone needs a non-Windows fallback.

## Recent context

- Screenshot that drove wrap: `/show-log` clipped mid-`model=cla…` at the panel edge — `wrapMode="none"` with no hand-wrap. Same `wrapWords` pattern BridgeScreen already used for blurbs.
- "Model swap" colour = **route-only** (`line.startsWith('[bridge] route ')`). Not `messages` / advisor notes.
- opentui paints selection highlights but never auto-copies — shell listens for finished `"selection"` events (`!isDragging`).
- Version banner alone still cannot tell installed `wisp.exe` from `bun run dev` without a package bump — stop the old exe before live-testing a new binary.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[gotchas]]
