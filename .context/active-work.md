---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: f2efe18 on `main` (PR #75 merged + title-nit fix), pushed._

## Current focus
**TUI slice 6 landed.** #63 — **`/bridge` + `wisp serve`** shipped as PR
[#75](https://github.com/EstarinAzx/Wisp-Router/pull/75): the Bridge engine (already in core) is now
hosted by whichever face wants it. `wisp serve` runs it headless (argv branch in `index.tsx`, lazy
imports — the native renderer is never touched); `/bridge` toggles it in the TUI with an
address/secret info screen. Extension host stays (#66 cancelled); its only change is
`DEFAULT_BRIDGE_PORT` moving to core. All six acceptance criteria verified live (real `claude -p`
through the headless bridge, OpenAI door curl, effort both ways, loud port collision, headless
toggle harness, user screenshot of the /bridge screen).

## State
- **Done this session (#63, PR #75, main @ f2efe18):**
  - tui: new `store.ts` (shared `~/.wisp` handle + OAuth managers, extracted from app.tsx so serve
    never imports the rendering module), `bridge.ts` (BridgeDeps wiring — twin of extension.ts's
    createBridgeServer call), `serve.ts` (headless run, SIGINT/SIGTERM → stop). `openai` dep added.
  - core: `DEFAULT_BRIDGE_PORT` exported from `bridgeServer.ts`; `slash.ts` gained `bridge`; suite
    **353/353**.
  - Issue #63 was rewritten pre-scoping (title said "extension host removed" — stale pre-#66 text).
  - Review (cavecrew) found + fixed pre-merge: double-/bridge bind race (in-flight guard — Bun's
    `isRunning()` is false until the bind lands), silent success off-palette, secret `trim()` drift
    vs the extension, `ensureBridgeSecret()` disk-write in JSX render (address+secret now ride in
    the mode object).
  - Bonus on main (`f2efe18`): /test border title → plain ASCII. The /bridge screenshot proved
    opentui border titles silently drop non-ASCII (em-dash/`·`) — see [[gotchas]].
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**#64 — `claude-wisp` launcher** (`ready-for-agent`, now unblocked by #63; critical path → #67
release). Suggested: `/preset scope 64`. Declare the `claude-wisp` bin ONLY in this slice (a bin
pointing at a missing file breaks install linking). #65 (/routing UI) is the parallel alternative.

## Skills for next session
- /preset scope — entry gate for #64 (or #65).

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- `/test` title fix (`f2efe18`) is compile-verified but not yet eyeballed in a terminal — glance at
  it during the next TUI slice.
- Codex is currently **signed out** on this machine (tombstone from #61 testing) — sign in before
  any Codex-path live checks.

## Recent context
- Ticket shape: #58✅→#59✅→#60✅→#61✅→#62✅→#63✅; open: #64 (unblocked), #65; #67 behind #64;
  backlog #68/#69.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; set `WISP_HOME` to sandbox).
  Headless: `bun src/index.tsx serve`.
- Both faces share the Bridge port + secret — testing serve while VS Code hosts the Bridge hits the
  (intended) loud port collision; stop one first.

## Related
- [[overview]] — TUI command list + serve entry re-anchored
- [[stack]] — test count bumped
- [[decisions]] — 2026-07-14 both-faces-host entry
- [[gotchas]] — opentui border-title non-ASCII trap appended
- [[pick-up]]
