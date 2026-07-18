---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**2.0.19 SHIPPING / SHIPPED this session.** Openclaude steal #1 is in:
one-shot bodies write bare `{type:'ephemeral'}` (5m); multi-turn
(`convo.length >= 2` after system strip) keep `ttl:'1h'`. Breakpoints (#111)
untouched. Meter (2.0.18) already live on the daily driver.

## What last session did

1. Confirmed daily driver on `wisp-router@2.0.18` (real usage meter).
2. Locked steal-list clarifications into the decision note (`turns >= 2` =
   this request body; #1 = biggest *optional* steal, not biggest problem).
3. Implemented steal #1 in `buildAnthropicMessagesBody`; 98/98 tests green.
4. Skipped #2 (already true) and #3 (no side-queries). Released as 2.0.19.

## Next task

Nothing code-pending on the steal list.

1. **Update daily driver to 2.0.19** if not already (`npm i -g wisp-router@2.0.19`).
2. Drive normal. Watch that one-shot writes stay cheap and multi-turn still
   retains the prefix across idle gaps.
3. Only reopen polish if: meter regresses, or bridge grows shared-prefix side
   calls (then #3 `skipCacheWrite`).

**Load-bearing invariant:** do NOT remove the cache breakpoints — silently
restores ~10× plan burn (`2026-07-16-anthropic-cache-breakpoints-are-wisp-placed`).

## Landmines

- **Release checklist order** (release.yml refuses on mismatch): bump
  `packages/tui/package.json` → span-baseline `--update` (from packages/tui) → tui
  CHANGELOG → tag == package.json version, `v`-prefixed.
- Use the **Edit tool** for package.json version (preserves encoding). PS 5.1
  `Set-Content -Encoding utf8` writes a BOM that breaks the file.
- Live-verify recipe (isolated `WISP_HOME` + `serve` on a spare port, never kill
  41184): [[live-verify-the-bridge-from-source-isolated-wisp-home-on-a-spare-port]].
- `wisp --version` doesn't exist — version is on the TUI splash.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-18-openclaude-cache-control-steal-list]]
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
