---
type: pick-up
project: wisp
updated: 2026-07-19
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE, committed, tagged, pushed):** TUI 2.0.23 polish —
`/show-log` wrap + route-line colour, `/bridge` plugin blurb gold `#D59D24`,
drag-select → clipboard (OSC52 / `clip.exe`). Commit `e31bcfc`, tag `v2.0.23`.

**Next task:** confirm the release landed, then pick fresh work.

```
gh run list --workflow=release.yml --limit 3
# expect v2.0.23 success → npm wisp-router@2.0.23 + GitHub assets
```

Optional install: stop any running `wisp.exe` first, then
`npm i -g wisp-router@2.0.23`.

**If TUI log / clipboard comes up again:**
- Wrap + colour live in `packages/tui/src/infoScreens.tsx` (`LogScreen`,
  `isRouteLogLine`); tokens in `theme.ts` (`LOG_ROUTE`, `PLUGIN_NUDGE`).
- Clipboard wire: `app.tsx` `renderer.on('selection')` → `clipboard.ts`
  (`copyText`). Don't auto-copy mid-drag.
- Regression: `packages/tui/tests/logScreen.test.ts`.

## Related

- [[active-work]]
- [[overview]]
