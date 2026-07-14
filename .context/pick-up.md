---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#64 landed — `claude-wisp` launcher** (PR #76 merged, main `86007b7`, all seven acceptance
criteria live-verified on Windows incl. a real round-trip: `claude-wisp --model haiku -p …` →
Bridge routed `haiku → opencode-go` → `pong`, exit 0). Core gained pure `buildClaudeLaunch`
(env trio + verbatim argv; suite **356/356**); the `claude-wisp` bin is now declared in
`packages/tui/package.json`. Cavecrew review fixed pre-merge: secretless probe, cmd-metachar
quoting, trailing-backslash doubling.

## Next task
**#67 — Release: CI binary matrix + npm `wisp-router` publish** (`ready-for-agent`, its only
blocker was #64 — now unblocked; ADR-0003: `bun build --compile` × 4 platforms + npm thin shell
exposing bins `wisp` + `claude-wisp`). Suggested: **`/preset scope 67`**. #65 (/routing UI) is
the parallel alternative.

## Landmines
- **ADR-0003 is the spec for #67** (`docs/adr/0003-tui-opentui-bun-compiled-binaries.md`) — read
  it before scoping; the npm name `wisp-router` goes public at first publish (one-way).
- **Dev shims to delete when #67 lands:** `C:\Users\S.D\.local\bin\wisp.cmd` + `claude-wisp.cmd`
  (bun-over-source shims added post-#64; they'd shadow the npm-installed bins). Plain-ASCII + CRLF
  only if ever edited — em-dash/LF in a .cmd misparses (same class as the opentui title trap).
- **opentui ships native per-platform binaries** (`core-win32-x64` etc.) — the `bun build
  --compile` matrix must pull the right one per target; cross-compiling from one runner may not
  work, hence the CI matrix.
- **Codex is signed out on this machine** (tombstone from #61) — `/signin codex` before Codex live
  checks; active provider IS codex, so a default `claude-wisp` run errors until sign-in (that's
  why #64 verification used `--model haiku` → keyed `opencode-go`).
- Both faces share the Bridge port + secret — a second host fails loud (intended); stop one first.
- TUI dev writes the REAL `~/.wisp` — set `WISP_HOME` when testing destructive flows.
- `/test` border-title fix (`f2efe18`) still not eyeballed in a terminal; opentui border titles
  must stay plain ASCII (gotchas.md).
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
