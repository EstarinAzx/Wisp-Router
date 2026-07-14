---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#59 landed — the Wisp home store** (`~/.wisp/config.json` + owner-only `auth.json`, ADR-0002).
PR #71 merged (main `e332a35`), F5 hand-checked by the user. Core gained `home.ts`/`homeStore.ts`
(+27 tests, suite 331/331); extension fully rewired off SecretStorage/globalState/state-settings.
**Same day: #66 (extension shrink) cancelled** — the panel + Inquire stay; Wisp = two full faces
(extension GUI + TUI) over the one shared store (decisions.md 2026-07-14 "Panel stays").

## Next task
**`/preset scope 60`** — TUI slice 3: the TUI MVP + `wisp-router`/`claude-wisp` naming (npm
`wisp`/`wisp-cli` are taken). Read #60 body + ADR-0003 (OpenTUI, Bun compiled binaries) first.
New branch off fresh main (e.g. `feat/tui-3-mvp`). `@wisp/tui` is an empty scaffold; the store
comes free from `@wisp/core` (`WispHome`). Frontier after: #61/#62/#63/#65 fan out.

## Landmines
- **Seed reads user scope only** (`inspect().globalValue`) in the extension's migration — never
  "fix" it back to merged `cfg().get()`: workspace values could redirect the bearer key.
- **`WISP_HOME` env** overrides the store dir — the TUI must honor it (tests/sandboxing rely on it).
- Old `wisp.*` entries in settings.json are dead knobs — state is `~/.wisp/`, don't debug settings.
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before `Ctrl+R`/F5; uninstall
  the installed Wisp before F5 (dup-panel trap).
- TUI parity tickets (#61/#63/#65) still matter for the TUI face — they just no longer gate any
  deletion (#66 is gone, don't resurrect it by accident when reading old PRD #57 slice lists).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[api]]
