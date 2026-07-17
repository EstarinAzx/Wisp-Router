---
type: pick-up
project: wisp
updated: 2026-07-17
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**You are on branch `claude/context-rehydration-oargfe`, NOT `main`.** A remote
session made two fixes here (`f33785d`, `a5ab0f2`), pushed but **not merged and
not released** — `main` is still at `f1fe5d6` (the 2.0.14 wrap-up). The
installed `wisp-router`/`claude-wisp` binary does NOT have these fixes yet. Both
are in `buildAnthropicMessagesBody` (`packages/core/src/anthropic.ts`) and only
touch the Anthropic-OAuth (Claude.ai Messages) path — Codex/Grok/API-key
providers use automatic prefix caching (no `cache_control`) and were never
affected.

## What last session did — two #111 cache follow-ups

**`f33785d` fix(core): spread cache breakpoints so fat tool turns don't re-bill.**
Closes a residual hole in the shipped #111 fix (`e5ec476`).

- **The hole:** #111 reconstructs two ephemeral `cache_control` breakpoints in
  `buildAnthropicMessagesBody` (`packages/core/src/anthropic.ts`) — last system
  block (covers tools+system) + the final message's last block. But Anthropic's
  automatic cache lookback only reaches ~20 content blocks back from a marker.
  Wisp collapses one Claude Code turn into a single message of many blocks, so a
  heavy parallel-tool turn (>~20 blocks) overshoots the window → next turn can't
  find the prior cache entry → re-bills the conversation prefix. Bounded (the
  bigger tools+system cache still hit), not another 10x, but a real quota miss —
  the original "ponytail" comment anticipated it.
- **The fix:** walk backward from the end placing a marker every ~15 blocks,
  spending the breakpoints left after system (4/request max → up to 3 on
  messages). A short conversation never reaches the step, so it emits exactly
  the one end-of-history marker — **byte-identical to the previous body**. Only
  fat turns trigger the intermediate markers.
- **Verified:** `bun run compile` clean, `bun run test` = 474 (added a fat-turn
  regression: no gap >20 blocks, total breakpoints ≤4). No `packages/tui`
  changes, so **no span-baseline recapture and no version bump were needed.**

**`a5ab0f2` fix(core): use 1h cache TTL on Anthropic breakpoints.** The
reconstructed markers used the 5-minute default ephemeral TTL, so a bridged
session's cached prefix expired after 5 min idle and re-wrote on the next
message — native Claude Code keeps its prefix warm ~1h. Switched the CACHE const
to `ttl:'1h'` (GA on first-party; the same TTL native uses over OAuth). Closes
the last quota-relevant parity gap for stop-and-go usage. Tradeoff: 1h writes
cost 2x vs 1.25x, worth it since an interactive session re-reads the prefix many
times. `bun run test` = 474 (all `cache_control` assertions now expect
`{ type: 'ephemeral', ttl: '1h' }`; the inbound-drop tests in
`bridgeAnthropic.test.ts` stay 5m — they're what Claude Code SENDS and Wisp
ignores, not what Wisp emits).

**Net effect:** for an active bridged session the Anthropic-OAuth path now caches
like native unwisped Claude — no 10x re-bill, and the prefix survives idle gaps.

## Next task — ship it, then optional follow-ups

1. **Review + merge:** review `git diff main` (two files:
   `packages/core/src/anthropic.ts` + `anthropic.test.ts`), merge this branch to
   `main`. Core-only change — **no span-baseline recapture, no package.json
   bump.**
2. **Release to reach the binary:** the fix only reaches the running
   `claude-wisp` after a `v2.x` release (tag = `packages/tui/package.json`
   version, `release.yml` publishes) + reinstall. A release DOES need a
   `packages/tui/package.json` bump → THEN recapture span-baseline (`bun
   scripts/span-baseline.tsx --update`) + update `packages/tui/CHANGELOG.md`.
3. **Optional, un-done fidelity gaps** (fidelity, NOT quota — left for greenlight):
   - **`is_error` passthrough** — the bridge drops `tool_result.is_error`.
     Threads through the shared normalized `toolResults` shape (`catalog.ts` →
     `bridgeAnthropic.ts` → `anthropic.ts`, ~4 files, both doors). Cheap-ish.
   - **thinking / redacted_thinking blocks, `document`/PDF blocks, 1h TTL** —
     left alone deliberately. Thinking-block preservation is a real tradeoff
     (Wisp also routes to non-Anthropic providers); PDF is a feature, not a nick.

## Landmines

- **This is a feature branch, against the solo-repo `main` habit.** The remote
  session was pinned to this branch. Merge to `main` yourself when happy.
- **Changelog split is policy:** `v2.x` release prep updates
  `packages/tui/CHANGELOG.md`; the vscode changelog is extension-only.
- Span baseline embeds the version string — any `packages/tui/package.json` bump
  drifts all 32 Screens; recapture with `bun scripts/span-baseline.tsx --update`
  as part of release prep. (Not needed to merge this fix — only if you release.)
- `plugins/slot/**` edits need `claude plugin update wisp-slot@wisp-router`.
- Tag must equal `packages/tui/package.json` version or release.yml refuses.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-17-wisp-router-gets-its-own-changelog]]
