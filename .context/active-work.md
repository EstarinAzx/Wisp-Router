---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: b554417 on `main` (PR #77 merged), pushed._

## Current focus
**TUI slice 8 landed.** #65 — **/routing** shipped as PR
[#77](https://github.com/EstarinAzx/Wisp-Router/pull/77): the Routing map (4 fixed Family routes +
user-named Aliases) is now editable from the TUI with panel parity. Flow: `/routing` overview →
provider picker (incl. Clear route / Remove alias) → live model list (`fetchModelOptions`) or
free-text fallback. Esc steps routing sub-screens back to the map, not the palette (deliberate
deviation from the every-screen-to-input rule; header comment updated).

## State
- **Done this session (#65, PR #77, main @ b554417):**
  - core: routing edit ops extracted as **pure fns** in `routing.ts` — `withFamilyRoute` /
    `withAlias` / `withoutAlias`, returning the next map or `undefined` = refused (dangling
    Provider id, empty/shadowing alias name). `FAMILY_KEYS` now exported. Suite **366/366**.
  - vscode: `setFamilyRoute`/`setAlias`/`removeAlias` in `extension.ts` now delegate to the core
    fns — behavior identical (refusal skips write + postState), one trust boundary for both faces.
  - tui: `/routing` palette entry (`slash.ts`) + six new Mode variants in `app.tsx`
    (`routing`, `alias-name`, `route-provider`, `route-model-loading/pick/free`). Alias-shadow
    refused at entry AND at persist; `titleLabel` sanitizes free-text names for opentui border
    titles (non-ASCII silently drops the whole title); model-fetch race guarded by **row reference
    identity** (stricter than /model's id check).
  - Live-verified headless: sandboxed `WISP_HOME` + `wisp serve`; alias appeared in `/v1/models`
    immediately, bridge log showed `route alias 'fast' -> opencode-go` and
    `route family 'claude-haiku-…' -> opencode-go`, removal applied without restart.
  - Cavecrew review applied pre-commit: write-before-status ordering, provider-aware "(current)"
    marker, ASCII title sanitizer.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**#67 — Release: CI binary matrix + npm `wisp-router` publish** (`ready-for-agent`, unblocked; the
critical-path finale — ADR-0003: `bun build --compile` × 4 platforms + npm thin shell exposing bins
`wisp` + `claude-wisp`). Suggested: `/preset scope 67`.
**#67 bonus (user-requested 2026-07-14):** a toggleable filter so the user can choose that Claude
Code's `/models` shows **only the set Aliases** (instead of Provider ids + aliases). Likely shape:
a `bridge.*` config flag beside `aliasPickerShowsModel` (same live-read BridgeDeps pattern), applied
in `buildAnthropicModelsList` (Anthropic door — that's what Claude Code lists); decide at scope time
whether the OpenAI door mirrors it. Backlog: #68 (chat mode), #69 (copilot-wisp).

## Skills for next session
- /preset scope — entry gate for #67.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)` —
  cosmetic, worth a glance in a Bridge slice.
- **`/routing` screens eyeballed by the user 2026-07-14 — confirmed working.** The `/test`
  border-title fix (`f2efe18`) wasn't explicitly confirmed — glance at it on a future `/test` run.
- Codex is still **signed out** on this machine (tombstone from #61) — `/signin codex` before any
  Codex live checks.

## Recent context
- Ticket shape: #58✅→#59✅→#60✅→#61✅→#62✅→#63✅→#64✅→#65✅; open: #67 (critical path);
  backlog #68/#69.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; set `WISP_HOME` to sandbox).
  Headless: `bun src/index.tsx serve`. Launcher: `bun src/claude-wisp.ts [args…]`.
- Both faces share the Bridge port + secret — testing serve while VS Code hosts the Bridge hits the
  (intended) loud port collision; stop one first. Sandbox trick: `WISP_HOME` + `bridge.port` in its
  config.json (write it WITHOUT a BOM — PS 5.1 `Set-Content -Encoding utf8` adds one and the lenient
  parser then drops the whole config).

## Related
- [[overview]] — /routing added to the TUI command list; routing.ts blurb gains edit ops
- [[stack]] — test count bumped to 366
- [[decisions]] — 2026-07-14 pure-edit-fns entry
- [[gotchas]]
- [[pick-up]]
