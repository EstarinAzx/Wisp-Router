---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: bd041c6 on `main` (PR #72 merged), pushed._

## Current focus
**TUI slice 3 landed.** #60 — the **TUI MVP** shipped as PR
[#72](https://github.com/EstarinAzx/Wisp-Router/pull/72): `packages/tui` is now **`wisp-router`
0.1.0** (bin `wisp`), opentui 0.4.3 + React on Bun. Splash + slash palette (live suggestions,
unique-prefix completion), `/providers`, masked `/key`, `/model` (live list / curated / free-text),
`/quit`. All state through the shared `WispHome`; user verified every acceptance criterion
including the cross-face round-trip into VS Code's native picker.

## State
- **Done this session (#60, PR #72, main @ bd041c6):**
  - core: `slash.ts` (parseSlash/suggestSlash pures + `SLASH_COMMANDS`) + 13 tests → suite
    **344/344**; **`PROVIDERS` moved verbatim** from `extension.ts` into `catalog.ts` (one
    catalog, two faces — extension now imports it).
  - tui: `src/index.tsx` (boot, shebang for the bin) + `src/app.tsx` (state-machine App:
    palette / providers / key-pick / key-entry / model-loading / model-pick / model-free).
  - Review (cavecrew) found + fixed: bare `process.exit` stranding the terminal in raw mode
    (🔴 — always `renderer.destroy()` first), stale model-fetch race (guard by provider id),
    `/key codex|anthropic` OAuth bypass, inline-key echo refusal. Deliberate skip: auth
    read-then-write merge isn't atomic (`ponytail:` in `app.tsx` — WispHome merge-fn if it bites).
  - Post-merge-review fix: opentui `<select>` renders **zero rows without an explicit height**
    (probe-verified); heights set on all three pickers.
  - Verified: tui + vscode `tsc` clean, bundles build, 344/344 Vitest, user eyeballed the full
    TUI flow + F5 picker.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**The fan-out is open: #61 / #62 / #63 / #65.** Suggested next: `/preset scope 61`
(OAuth from the terminal — `/signin codex|anthropic` + `/effort`; the product differentiators).
#64 waits on #63; #67 (release) waits on #64.

## Skills for next session
- /preset scope — entry gate for whichever fan-out ticket is picked.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- `claude-wisp` **bin is not declared yet** — deferred to #64 (a bin pointing at a missing file
  breaks install linking); ADR-0003 naming otherwise done.
- #63's title still says "extension host removed" — stale wording from before the #66
  amendment (the panel/extension Bridge host **stays**; `wisp serve` adds a terminal host).
  Re-read the body against decisions.md before scoping it.

## Recent context
- Ticket shape: #58✅→#59✅→#60✅, fan-out #61/#62/#63/#65 now unblocked; #64 behind #63;
  #66 cancelled (panel stays); #67 behind #64; backlog #68/#69.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; set `WISP_HOME` to sandbox).
- opentui facts that cost time: select needs explicit `height` (2 rows/option with description);
  input has no masked mode (key entry is hand-rolled useKeyboard+usePaste); exit must
  `renderer.destroy()` before `process.exit`.

## Related
- [[overview]] — layout re-anchored: tui is a real package now, PROVIDERS lives in core
- [[stack]] — TUI stack section added (opentui/react/bun), test count bumped
- [[decisions]] — 2026-07-14 TUI-MVP execution entry
- [[gotchas]] — opentui select-height + raw-mode-exit traps added
- [[pick-up]]
