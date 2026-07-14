---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**#58 landed — the repo is a bun-workspaces monorepo** (PR #70 merged, main `b0323ef`).
`packages/core` (engine + 304 tests, private, raw-TS consumed, barrel `index.ts`) ·
`packages/vscode` (extension; esbuild bundles `dist/extension.js` so vsce escapes
`workspace:*`) · `packages/tui` (empty scaffold). All acceptance criteria verified incl.
hand-checked F5. `.context/` overview/stack/gotchas re-anchored to the new layout.

## Next task
**`/preset scope 59`** — TUI slice 2: Wisp home store (`~/.wisp/` + auth.json, ADR-0002).
Read #59 body + ADR-0002 first. New branch off fresh main (e.g. `feat/tui-2-wisp-home`).
Frontier after: #60 (TUI MVP) → fan-out #61/#62/#63/#65.

## Landmines
- **Auth managers await #59:** `codexAuth.ts`/`anthropicAuth.ts` sit in `packages/vscode`
  because they use `vscode.SecretStorage` — #59 moves secrets to auth.json; the managers'
  pure token cores are already in core's `catalog.ts`. OAuth two-process refresh races:
  atomic writes + re-read-before-refresh (acceptance criteria in #59).
- **`tsc` no longer emits a runnable build** — typecheck-only; the bundle is esbuild
  (`bun run compile` in `packages/vscode` before `Ctrl+R`, or stop→F5).
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Wrap-up commit on main is local — push not done (preset rule); push when convenient.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[happy-path]] · [[gotchas]]
