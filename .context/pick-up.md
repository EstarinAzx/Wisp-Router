---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#63 landed — `/bridge` + `wisp serve`** (PR #75 merged, main `f2efe18`, all six acceptance
criteria live-verified incl. a real `claude -p` through the headless bridge and a user screenshot
of the /bridge screen). The Bridge engine is hosted in-process by whichever face wants it — no
wrapper, no daemon; extension host stays (#66 cancelled). Both faces share `~/.wisp` port + secret;
a second host fails loud (no port-hop). Bonus: /test border title → plain ASCII (`f2efe18`) — the
screenshot proved opentui border titles drop non-ASCII. Suite 353/353.

## Next task
**#64 — `claude-wisp`: env-wired Claude Code launcher** (`ready-for-agent`, unblocked by #63; the
critical path: → #67 release). Suggested: **`/preset scope 64`**. #65 (/routing UI) is the parallel
alternative.

## Landmines
- **`claude-wisp` bin gets declared IN #64** (it was deliberately left out of package.json until the
  launcher file exists — a bin pointing at a missing file breaks install linking). Per the PRD arc:
  env on the child process only, verbatim arg passthrough, fail-friendly when the Bridge is down.
- **Both faces share the Bridge port + secret** — a launcher test while VS Code (or a stray
  `wisp serve`) hosts the Bridge hits the intended loud port collision; stop one first.
- **opentui border titles must stay plain ASCII** (em-dash/`·` silently drop the title — gotchas.md).
  The /test title fix (`f2efe18`) compiles but hasn't been eyeballed — glance during the next TUI run.
- **Codex is signed out on this machine** (tombstone from #61 testing) — `/signin codex` before any
  Codex live checks.
- TUI dev run writes the REAL `~/.wisp` — set `WISP_HOME` when testing destructive flows. Headless:
  `bun src/index.tsx serve` from `packages/tui`.
- opentui: `<select>` needs explicit `height`; every exit path must `renderer.destroy()` before
  `process.exit` (gotchas.md).
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5; uninstall the
  installed Wisp first (dup-panel trap).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
