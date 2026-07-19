---
type: pick-up
project: wisp
updated: 2026-07-19
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Latest (2026-07-19): 2.0.20 shipped live — Anthropic cache TTL fix

Branch **`claude/anthropic-cache-ttl-fix`** merged to main and released as **2.0.20**
(npm `wisp-router@2.0.20` + GitHub `v2.0.20`, all 4 platform binaries; release.yml green).
The fix moves the Anthropic cache TTL from turn-count (`convo.length >= 2 ? 1h : 5m`, which
flipped mid-session and busted the prefix cache) to **fixed per call path**: `anthropicStream`
(sessions)→1h, `anthropicInquire` (one-shot)→5m, haiku always 5m. Added a `prompt-cache MISS`
log on the Bridge's Anthropic door. #111 breakpoint placement untouched. Details:
[[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]] +
[[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]].

## Next task

**Nothing code-pending. Drive normal.**

Only housekeeping left: delete the merged branch `claude/anthropic-cache-ttl-fix`
(local + remote) — safe now that 2.0.20 is live.

## Landmines

- **Do NOT re-derive the Anthropic cache TTL from `convo.length`** — that's exactly the bug
  2.0.20 fixed. TTL is fixed per call path at the two `anthropicClient` entry points.
- **Do NOT remove the #111 cache breakpoints** — silently restores ~10× plan burn
  (`2026-07-16-anthropic-cache-breakpoints-are-wisp-placed`).
- **Release checklist order** (release.yml gates tag == tui version): bump
  `packages/tui/package.json` → `bun scripts/span-baseline.tsx --update` (version string renders
  in the splash → baseline must match) → tui CHANGELOG → tag `v<x.y.z>` == package.json version.
- **Use the Edit tool for any package.json version bump** (PS 5.1 `Set-Content -Encoding utf8`
  writes a BOM that breaks the file).
- **vscode ext version ≠ TUI version.** `packages/vscode/package.json` is 1.7.0; TUI is 2.0.20.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]] · [[flows]]
- [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]]
- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]
