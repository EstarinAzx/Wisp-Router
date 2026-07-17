---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## What last session finished

**v2.0.12 confirmed shipped + TUI ops batch planned.** Release run for `v2.0.12` green
(all platforms + publish), `npm view wisp-router version` → `2.0.12` (re-check once more —
npm spam filter has removed green publishes late; [[gotchas]]). Then a grill settled the
TUI ops batch (decision:
[[2026-07-17-bridge-idempotent-on-showlog-panel-command-first-headless-cli]]):
spec **#120** published, sliced into tickets **#121** (/bridge ensure-on + `/bridge off`),
**#122** (/show-log ring-buffer Log Screen), **#123** (headless `wisp providers` +
`wisp models <provider>`), plus parked backlog **#124** (wisp-slot session-awareness,
ready-for-human). `.claude/loop-arg.md` re-seeded with the #121→#122→#123 goal.

## Next task

**Run the ticket chain under relay.** `/relay N=3 /preset loop-arg` — self-paced (no
interval; user preference), one ticket per firing, `.context/` rehydrates each leg.
GOAL + NEXT already seeded in `.claude/loop-arg.md` (arg-less invocation is fine — the
seed guard ignores re-injected args). Stale relay state from the finished #114 chain sits
at `.claude/relay/loop-arg.md` (`stop: true`); a fresh `/relay` invocation re-seeds it —
if it balks, delete that file first. Chain-end: wrap-up hands release tagging to the next
note (tagging is outside the loop goal).

## Landmines

- Any NEW native `<select>` must spread **both** `SELECT_COLORS` and `SELECT_MOUSE` (homes:
  `src/theme.ts` + `src/widgets.tsx`).
- `SELECT_MOUSE` reads opentui privates, dep pinned exact 0.4.3 — any `@opentui/*` bump must
  re-run `bun test` in `packages/tui` ([[select-mouse-leans-on-opentui-privates]]).
- `bun run spans --update` only ever rides a version bump — never a move-only change.
- Tag must equal `packages/tui/package.json` version or release.yml refuses.
- Screen modules import from `./modes`/`./theme`/`./widgets`/`./providerScreens` — never from
  the shell (circular). #123's headless command path must stay renderer-free (no Screen
  imports; extract the model-fetch helper out of the provider Screens module if needed).
- Slot skill exists TWICE — personal `~/.claude/skills/slot` vs repo `plugins/slot`; fixes go
  to both ([[slot-skill-has-two-copies-personal-vs-plugin]]).
- Never restore a Slot while its agent runs ([[accidental-tui-open-rewrites-all-family-routes]]).
- PowerShell env checks lie about bridging — use Bash
  ([[powershell-profile-env-masks-session-env]]).

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-17-bridge-idempotent-on-showlog-panel-command-first-headless-cli]]
