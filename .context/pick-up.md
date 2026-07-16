---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**#108 closed** — `wisp routing` text view + faithful `--json` snapshot committed as `8483598`. Pure decision logic lives in `packages/core/src/routingCli.ts`; TUI store/print glue in `packages/tui/src/routingCli.ts`; dispatch is lazy before OpenTUI imports. Runtime proof used isolated `WISP_HOME`; suite 441/441 and both typechecks passed.

## Next task
**#109 — routing set/unset + validation + credential warning** (now unblocked). Run `/preset scope 109`; read #109 + spec #107. Extend the existing pure core seam and tests, keep side effects in TUI glue, update TUI README, then live-verify a Bridge reads the edit on its next request. Afterward: #110 personal Slot skill.

## Landmines
- `--json` must keep serializing the stored `RoutingMap` directly — no filled family defaults or alias sorting.
- Target parsing splits on the first `/`; model ids may contain later slashes.
- Missing credentials warn and still write; unknown Provider / Provider-id alias shadow refuse and write nothing.
- Slot restore waits for session end, never mid-agent — routing resolves per request.
- `8483598` is committed locally on `main` but was not pushed or released this session.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[flows]] · [[happy-path]]
