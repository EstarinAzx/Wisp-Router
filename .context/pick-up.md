---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#60 landed — the TUI MVP** (PR #72 merged, main `bd041c6`, user-verified end to end).
`packages/tui` = **`wisp-router` 0.1.0**, bin `wisp`: splash + slash palette, `/providers`,
masked `/key`, `/model` (live/curated/free-text), `/quit` — all over the shared `WispHome`,
round-trip into VS Code's picker confirmed. Core gained `slash.ts` (+13 tests, suite 344/344)
and now owns the **`PROVIDERS` array** (moved from extension.ts — one catalog, two faces).

## Next task
**Pick from the open fan-out #61 / #62 / #63 / #65** — suggested: **`/preset scope 61`**
(OAuth from the terminal: `/signin codex|anthropic` + `/effort` — the subscription
differentiators). The OAuth managers (`codexAuth.ts`/`anthropicAuth.ts`) still live in
`packages/vscode` for the loopback servers + injected `openExternal`; #61 needs that machinery
reachable from the TUI. #64 waits on #63; #67 (release) waits on #64.

## Landmines
- **#63's title says "extension host removed" — stale** (pre-#66 wording). The extension's
  Bridge host STAYS; `wisp serve` only adds a terminal host. Check body against decisions.md.
- **`claude-wisp` bin deliberately not declared** until #64 — a bin pointing at a missing file
  breaks install linking. Don't "complete the naming" early.
- opentui: `<select>` needs explicit `height` (else zero rows); every exit path must
  `renderer.destroy()` before `process.exit` (see gotchas.md).
- TUI dev run writes the REAL `~/.wisp` — set `WISP_HOME` when testing destructive flows.
- Seed reads user scope only (`inspect().globalValue`) in the extension migration — never
  "fix" it to merged `cfg().get()`.
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5; uninstall the
  installed Wisp first (dup-panel trap).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
