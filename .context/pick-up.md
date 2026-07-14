---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#62 landed — `/test` wiring check** (PR #74 merged, main `219c00f`, all five acceptance criteria
verified live + user screenshot of the rendered screen). `/test <provider|alias>` streams one canned
prompt's raw reply into the TUI: alias pinned model wins, unknown names error (empty active id into
`resolveRoute` — no silent fallback), unusable targets print the backend's own error (keyless rows
send bare on purpose). New core pure `chatCompletionTextDelta` (data-only chat SSE, CRLF mega-block
fallback). Suite 352/352.

## Next task
**Pick from the open fan-out #63 / #65** — suggested: **`/preset scope 63`** (`wisp serve`, the
critical path: unblocks #64 `claude-wisp` launcher → #67 release). #65 is the smaller alternative.

## Landmines
- **#63's title says "extension host removed" — stale** (pre-#66 wording). The extension's Bridge
  host STAYS; `wisp serve` only adds a terminal host. Check body against decisions.md before scoping.
- **`claude-wisp` bin deliberately not declared** until #64 — a bin pointing at a missing file
  breaks install linking. Don't "complete the naming" early.
- **Codex is signed out on this machine** (tombstone from #61 testing) — `/signin codex` before any
  Codex live checks.
- Cosmetic, unconfirmed: the /test box's **border title didn't render** in the screenshot — other
  bordered screens show titles; suspect the em-dash/`·` or width. Eyeball next TUI slice.
- /test is explicit-target-only and failures speak the backend's words — settled, don't "helpfully"
  add an Active fallback or a local no-key gate (decisions.md 2026-07-14).
- `streamTestReply` is exported from app.tsx **on purpose** (headless acceptance drives the
  production helper) — not dead code.
- opentui: `<select>` needs explicit `height`; every exit path must `renderer.destroy()` before
  `process.exit` (see gotchas.md).
- TUI dev run writes the REAL `~/.wisp` — set `WISP_HOME` when testing destructive flows.
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5; uninstall the
  installed Wisp first (dup-panel trap).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
