---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#61 landed — OAuth from the terminal** (PR #73 merged, main `997e033`, user-verified end to end).
`codexAuth.ts`/`anthropicAuth.ts` moved into **core** (editor-free; both faces share one
implementation). TUI gained `/signin codex|anthropic` (browser flow, rundll32 opener on win32),
`/signout` (tombstone), `/effort` (low→max, live to the extension via the dir watcher), and
`signed in / signed out` markers on `/providers` OAuth rows. Suite 345/345.

## Next task
**Pick from the open fan-out #62 / #63 / #65** — suggested: **`/preset scope 62`** (`/test`:
one canned prompt through a Provider or Alias — quick, and proves the freshly signed-in OAuth
Providers answer from the terminal). Critical path alternative: #63 (`wisp serve`) unblocks
#64 (`claude-wisp` launcher) → #67 (release).

## Landmines
- **#63's title says "extension host removed" — stale** (pre-#66 wording). The extension's
  Bridge host STAYS; `wisp serve` only adds a terminal host. Check body against decisions.md.
- **`claude-wisp` bin deliberately not declared** until #64 — a bin pointing at a missing file
  breaks install linking. Don't "complete the naming" early.
- Active ≠ signed-in: sign-out never changes the Active Provider (decisions.md 2026-07-14) —
  don't "fix" that.
- Esc on the signin-wait screen detaches the UI only — loopback lives out its 5-min timeout
  (`ponytail:` in app.tsx). Known, deliberate.
- opentui: `<select>` needs explicit `height`; every exit path must `renderer.destroy()` before
  `process.exit` (see gotchas.md).
- TUI dev run writes the REAL `~/.wisp` — set `WISP_HOME` when testing destructive flows.
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5; uninstall the
  installed Wisp first (dup-panel trap).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
