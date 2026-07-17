---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**TUI split complete (relay leg 3, chain stopped).** #119 palette/test/info Screens →
`src/paletteScreen.tsx` + `src/testScreen.tsx` + `src/infoScreens.tsx` (`26418dd`);
`streamTestReply` re-exported from app.tsx for headless use; shell = Mode machine + dispatch +
keyboard + starters only. Spec #114 closed. Gates green (spans 32/32, `tsc`, scoped verify
skill). The `/relay N=2 /preset loop-arg` chain wound down cleanly — both stop flags set.

## Next task

**Tag a release.** The whole split (#115–#119) + the select-transparency fix `bb6465b` are
source-only; the published binary is still 2.0.11. Steps: bump `packages/tui/package.json`
version → `bun run spans --update` in the SAME change (the harness embeds the version header)
→ commit → tag `v<version>` (must equal the package version — release.yml gate) → push tag →
`.github/workflows/release.yml` builds + publishes `wisp-router`. Pick the bump size (fix +
internal refactor → patch, e.g. 2.0.12) or ask the user.

## Landmines

- `bun run spans --update` is REQUIRED with the version bump (baseline embeds the version) —
  the only sanctioned `--update`; keep it in the release commit, never a move-only one.
- Tag must equal `packages/tui/package.json` version or release.yml refuses.
- Any NEW native `<select>` must spread `SELECT_COLORS` (home: `src/theme.ts`).
- Screen modules import from `./modes`/`./theme`/`./widgets`/`./providerScreens` — never from
  the shell (circular).
- Slot skill exists TWICE — personal `~/.claude/skills/slot` vs repo `plugins/slot`; fixes go
  to both; never `/plugin install wisp-slot` on this machine
  ([[slot-skill-has-two-copies-personal-vs-plugin]]).
- Never restore a Slot while its agent runs; an accidental bare `wisp` open can rewrite ALL
  family routes ([[accidental-tui-open-rewrites-all-family-routes]]).
- PowerShell env checks lie about bridging — use Bash
  ([[powershell-profile-env-masks-session-env]]).

## Related

- [[active-work]] · [[overview]] · [[api]] · [[decisions]] · [[happy-path]] · [[gotchas]]
