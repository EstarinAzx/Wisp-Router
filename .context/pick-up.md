---
type: pick-up
project: wisp
updated: 2026-07-14
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**The whole Wisp TUI arc staged — zero code.** `/preset init` end to end: grill (9 branches
settled), TUI MVD added to happy-path.md, PRD **#57** published, tickets **#58–#67**
(`ready-for-agent`, real blocking edges) + **#68/#69** backlog. CONTEXT.md gained the TUI-era
terms; ADRs 0001–0003 record monorepo / auth.json secrets / opentui+Bun binaries. All docs on
main at `c1f63dc`, pushed.

## Next task
**`/preset scope 58`** — TUI slice 1: restructure to a bun-workspaces monorepo
(packages core / vscode / tui), zero behavior change. Only unblocked ticket. Read #58 + ADR-0001
first. Frontier after: #59 (Wisp home store) → #60 (TUI MVP) → fan-out.

## Landmines
- **Restructure must land green as one PR:** 304 Vitest tests relocated, F5 works, `.vsix`
  packages — vsce can't resolve `workspace:*`, so the extension needs a bundling step (ADR-0001
  consequence).
- **`Ctrl+R` in the Extension Dev Host runs the STALE build** — `npm run compile` (soon
  `bun run`) first, or stop→F5.
- **Before any F5 / reinstall:** uninstall the installed Wisp first (dup-panel trap).
- Git trap seen 2026-07-13: a commit meant for a fresh branch landed on local main — check
  `git branch --show-current` before committing.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[happy-path]] · [[gotchas]]
