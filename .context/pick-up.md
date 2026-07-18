---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**2.0.19 live end-to-end.** Daily driver on `wisp-router@2.0.19` (= npm latest) and the
running bridge (PID 29584) started 16s after the install, so it's already on that binary —
verified this session, no restart needed. Openclaude steal #1 is in: one-shot bodies write
bare `{type:'ephemeral'}` (5m); multi-turn (`convo.length >= 2` after system strip) keep
`ttl:'1h'`. Breakpoints (#111) untouched.

## What last session did

1. Confirmed 2.0.19 on daily driver AND the live bridge process (start-time vs install mtime).
2. Diagnosed the codex `502 … input exceeds the context window` — it's a passthrough of the
   codex model's own window (400K gpt-5.x / 200K o-series), bridge forwards untrimmed. Not a
   bridge bug. Wrote it up as a gotcha.
3. Parked bridge-side pre-trim as a floating plan (active-work Open questions).

## Next task

**Nothing code-pending.** Drive normal.

- Codex 502s are operational, not bugs — `/compact` (or `/clear`) before switching to a codex
  model shrinks the convo under its window; keep images off big codex turns; or run codex work
  in a fresh `/slot` subagent. See gotcha
  [[codex-502-input-exceeds-context-window-is-the-providers-limit-not-the-bridge]].
- Reopen bridge code only if the usage meter regresses, or you decide to build the pre-trim
  feature, or the bridge grows shared-prefix side calls (then optional #3 `skipCacheWrite`).

**Load-bearing invariant:** do NOT remove the cache breakpoints — silently restores ~10× plan
burn (`2026-07-16-anthropic-cache-breakpoints-are-wisp-placed`).

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
