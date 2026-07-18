---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**On branch `claude/real-usage-meter` (branched from `971cefd`/`v2.0.17`). Real
usage meter built + verified, committed on the branch, NOT merged, NOT released.**
The Anthropic door used to synthesize `usage: {input_tokens:0, output_tokens:0}`
— the wisped client's token/cost meter read zeros and `cache_read` was invisible.
Now the backend's real usage rides end-to-end: `message_start` carries the real
input/cache snapshot, `message_delta` the final counts. Grill-free (bounded
feature, approach agreed in-session), TDD, live-verified through a from-source
bridge on an isolated home/spare port (`cache_read=1757` on a warm call).

## What last session did

1. Diagnosed the meter: bridge discards Anthropic's `usage` (never read
   `message_start`/`.usage`), synthesizes zeros. Proved the real wire shape with
   a direct probe (cache_creation → cache_read across two calls).
2. Built TDD: `anthropicUsage` helper → `usage` event on both stream unions →
   encoder `setUsage` + real `message_start`/`message_delta` → door lazy-start.
   Core vitest **506** (was 498, +8), 3 packages typecheck clean.
3. Live E2E through from-source bridge (isolated `WISP_HOME`, port 41185): the
   client-facing usage frames now carry real input/cache/output.

## Next task — release, or discard

- **Release `claude/real-usage-meter`** to make the meter live in the daily
  driver (the running 41184 install is still the zeros build). Follow the
  release checklist below. Merge fast-forward to main, then release.
- OR discard the branch if not wanted — the change is additive and low-risk,
  but not mandatory.

## Landmines

- **Release checklist (order matters or release.yml refuses):** bump
  `packages/tui/package.json` → span-baseline (`bun scripts/span-baseline.tsx
  --update` from packages/tui) → tui CHANGELOG → tag == package.json version.
- PS 5.1 `Set-Content -Encoding utf8` writes a BOM — package.json needs a
  BOM-less rewrite (`[IO.File]::WriteAllText` + `UTF8Encoding($false)`).
- Live-verify recipe (isolated `WISP_HOME` + `serve` on a spare port, never kill
  41184): [[live-verify-the-bridge-from-source-isolated-wisp-home-on-a-spare-port]].
- `bridgeSecret` is **top-level** in `auth.json`, not under `.anthropic`.
- `wisp --version` doesn't exist — version is on the TUI splash.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
