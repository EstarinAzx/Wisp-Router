---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#65 landed — `/routing` in the TUI** (PR #77 merged, main `b554417`). The Routing map (4 Family
routes + Aliases) is editable from the TUI with panel parity: overview → provider picker (incl.
Clear/Remove) → live model list or free text. Edit ops extracted to core as pure fns
(`withFamilyRoute`/`withAlias`/`withoutAlias`, refusal = `undefined`); the extension delegates to
them. Suite **366/366**. Live-verified against a sandboxed `wisp serve`: alias advertised in
`/v1/models` instantly, bridge log confirmed `route alias`/`route family` per the edited map.

## Next task
**#67 — Release: CI binary matrix + npm `wisp-router` publish** (`ready-for-agent`, the critical-path
finale; ADR-0003: `bun build --compile` × 4 platforms + npm thin shell exposing bins `wisp` +
`claude-wisp`). Suggested: **`/preset scope 67`**.
**Plus a user-requested bonus:** a toggleable filter — user decides whether Claude Code's `/models`
lists **only the set Aliases** (hide Provider ids). Pointers: `bridge.*` config flag beside
`aliasPickerShowsModel` (same live BridgeDeps read), applied in `buildAnthropicModelsList`
(Anthropic door = Claude Code's list); scope decides if the OpenAI door mirrors it, plus the
toggle's surfaces (panel + TUI). Backlog: #68 (chat mode), #69 (copilot-wisp).

## Landmines
- **ADR-0003 is the spec for #67** (`docs/adr/0003-tui-opentui-bun-compiled-binaries.md`) — read it
  before scoping; the npm name `wisp-router` goes public at first publish (one-way).
- **Dev shims to delete when #67 lands:** `C:\Users\S.D\.local\bin\wisp.cmd` + `claude-wisp.cmd`
  (they'd shadow the npm-installed bins). Plain-ASCII + CRLF only if ever edited.
- **opentui ships native per-platform binaries** (`core-win32-x64` etc.) — the compile matrix must
  pull the right one per target; cross-compiling from one runner may not work, hence CI matrix.
- `/routing` screens eyeballed by the user 2026-07-14 — working. `/test` border-title fix
  (`f2efe18`) not explicitly confirmed yet — glance on a future `/test` run.
- **Codex is signed out on this machine** (tombstone from #61) — `/signin codex` before Codex live
  checks; default `claude-wisp` run errors until then (use `--model haiku` → `opencode-go`).
- Both faces share the Bridge port + secret — second host fails loud (intended); stop one first.
- TUI dev writes the REAL `~/.wisp` — set `WISP_HOME` when testing destructive flows. If you seed a
  sandbox config.json by hand, write it WITHOUT a BOM (PS 5.1 `Set-Content -Encoding utf8` adds one
  and the lenient parser drops the whole config — port override silently ignored).
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before F5.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
