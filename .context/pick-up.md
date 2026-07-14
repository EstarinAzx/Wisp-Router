---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#59 implemented — the Wisp home store** (`~/.wisp/config.json` + owner-only `auth.json`,
ADR-0002). PR [#71](https://github.com/EstarinAzx/Wisp-Router/pull/71) open on branch
`feat/tui-2-wisp-home` (162cdf1, pushed). Core gained `home.ts`/`homeStore.ts` + 27 tests
(suite 331/331, compile clean); extension fully rewired (SecretStorage/globalState/state-settings
retired, three ordered activate migrations, `~/.wisp` fs watcher); reviewer findings incl. a
workspace-injection hole in the migration seed fixed.

## Next task
**F5 eyeball PR #71, merge, then `/preset scope 60`.** F5 checklist (uninstall installed Wisp
first — dup-panel trap): (1) set a key in the panel → lands in `~/.wisp/auth.json`, file owner-only
on POSIX; (2) restart the dev host → provider/model/effort/routing/Bridge settings rehydrate;
(3) an installed pre-#59 profile migrates once (SecretStorage slots emptied) and launch 2 no-ops;
(4) hand-edit config.json while running → panel updates (watcher); (5) Bridge start reuses the
migrated secret. Then merge #71 → `/preset scope 60` (TUI MVP + `wisp-router`/`claude-wisp` naming)
off fresh main.

## Landmines
- **Seed reads user scope only** (`inspect().globalValue`) — never "fix" it back to merged
  `cfg().get()`: workspace values could redirect the bearer key (see gotchas + 2026-07-14 decision).
- `tsc` is typecheck-only — `bun run compile` in `packages/vscode` before `Ctrl+R`/F5.
- Old `wisp.*` entries in settings.json are dead knobs now — don't debug them, state is `~/.wisp/`.
- `WISP_HOME` env overrides the store dir (tests/sandboxing); #60's TUI should honor it too.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[api]]
