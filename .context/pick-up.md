---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**2.0.18 SHIPPED.** The real usage meter is merged, released, and published.
`main` == `v2.0.18` (release commit `388f73f`, context follow-up `e3abbd2`).
GitHub release `wisp-router 2.0.18` carries all four platform binaries; npm
`wisp-router@2.0.18` is live. The Anthropic door now forwards the backend's real
token usage (input / `cache_creation` / `cache_read` / output) end-to-end instead
of synthesizing zeros — the client meter reads truth, and the always-1h cache
**write premium is measurable for the first time**.

## What last session did

1. Found the meter branch was already merged + pushed to `main` (prior pick-up
   note was stale). Only the release ceremony remained.
2. Ran the checklist: bump `packages/tui` 2.0.17→2.0.18 → span-baseline `--update`
   (32/32 clean) → CHANGELOG 2.0.18 → commit → tag `v2.0.18` → push. release.yml
   went green (4 builds + publish).
3. Recorded the openclaude cache_control review as a decision:
   `2026-07-18-openclaude-cache-control-steal-list.md` — second-opinion agent
   agrees with the existing #111 design; nothing urgent, two optional polishes.

## Next task — watch the meter, THEN decide cache polish

The cache "clunks" the review flagged are all optional and **gated on data the
meter now provides**. Don't code anything yet:

1. **Update the daily driver to 2.0.18** (`npm i -g wisp-router@2.0.18`, or your
   run path) — the previously-running install shipped the zeros build, so the
   meter isn't visible until you're on 2.0.18.
2. Run normal for a bit and watch whether the **always-1h write premium** (2× vs
   5m's 1.25×) actually shows on the plan meter.
3. **Only if it bites** → implement steal-list polish #1 (bare 5m ephemeral by
   default, `ttl:'1h'` only for multi-turn sessions). Else YAGNI holds.

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
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
- [[2026-07-18-openclaude-cache-control-steal-list]]
