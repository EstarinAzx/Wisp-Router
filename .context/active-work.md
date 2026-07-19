---
type: active-work
project: wisp
updated: 2026-07-19
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-19 by Opus 4.8 (1M) (wrap-up)._
_At commit: 2f0e61a (release 2.0.22)._

## Current focus

**2.0.22 is committed, not yet tagged/pushed.** Two commits on `main`:
- `82d90e2` fix(bridge): stop advisor 400 from cache_control marker leak + reviewer echo
- `2f0e61a` chore(release): 2.0.22 - advisor cache_control leak + reviewer harden

Live-verified on a real heavy session (effort=xhigh, thinking, tool history,
images=4): no more `"Found 5"` 400, reviewer returns real advice, continuation
round-trips. Tag `v2.0.22` + push is the remaining release step (triggers
`release.yml` → 4 binaries + npm `wisp-router@2.0.22`).

## State

- **In flight:** tag + push of `v2.0.22` (user-authorized; wrap-up does not push).
- **Done this session:** diagnosed and fixed two live Advisor failures on top of
  the 2.0.21 ship:
  1. **Root 400:** `buildAnthropicMessagesBody` mutated caller `rawContent` by
     reference when placing #111 breakpoints. Advisor builds 2–3× from the same
     `parsed.turns` → markers stacked past Anthropic's cap of 4. Fix: replay a
     stripped *copy* of `rawContent` (`anthropic.ts`). Regression test asserts
     the input stays marker-free across repeated builds.
  2. **Reviewer echo:** reviewer sub-call forwarded `parsed.system` (Claude
     Code's `# Advisor Tool` section) + raw turns → even real Opus parroted
     meta-instructions. Fix: pure `reviewerSystem()` + `serializeForReview()`
     in `bridgeAnthropic.ts`; door wiring in `bridgeServer.ts` uses them only.
     Reviewer is text-only (images noted, not embedded).
  - Live path: wrong binary first (installed 2.0.21 held `:41184`; version
    banner can't discriminate without a bump) → source `bun run dev` after kill
    → real advice + still-Found-5 on continuation → mutation fix → restart →
    clean round-trip. 537 core tests, core/tui/vscode tsc clean, span baseline
    recaptured for splash `v2.0.22` only (32 screens, no functional drift).
- **Verified:** live on source Bridge (port 41184) after the mutation fix —
  advisor returned a full critical review and the continuation completed with
  no 400 in the Bridge log.
- **Blocked:** none.

## Pick up here

1. Tag + push: `git tag v2.0.22 && git push origin main --tags` (tag must equal
   `packages/tui/package.json` version — release.yml hard-checks).
2. Watch `release.yml` go green; confirm npm `wisp-router@2.0.22` + GitHub
   release assets.
3. Optional: `npm i -g wisp-router@2.0.22` (note: running `wisp.exe` locks the
   binary and can block the npm unlink — stop the Bridge first).
4. Nothing else code-pending after the release lands.

## Skills for next session

- `/preset ci-babysit` (or just watch the release run) if the tag is pushed.
- Otherwise drive normal.

## Open questions

- Reviewer is text-only by design post-2.0.22 (`serializeForReview` notes
  images, doesn't embed). Revisit only if an advisor use case needs to *see*
  pasted screenshots.
- Optional openclaude cache steal #3 (`skipCacheWrite` for forks) still parked.

## Recent context

- The "Found 5" was **not** "too many breakpoints in one build" — the builder
  hard-caps at 4. It was cross-build leakage via shared `rawContent` arrays.
  Don't "fix" it by lowering `MSG_BREAKPOINTS`.
- Version banner alone cannot tell installed `wisp.exe` from `bun run dev`
  when package.json hasn't been bumped yet — check bind log + that the old
  exe is dead (EADDRINUSE / `unlink …wisp.exe` permission errors are the tells).
- Don't remove #111 cache breakpoints; don't re-derive TTL from `convo.length`
  (see [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-19-advisor-cache-control-mutation-and-reviewer-frame]]
- [[2026-07-19-wisp-native-advisor-via-door-server-tool]]
- [[buildanthropicmessagesbody-must-not-mutate-caller-rawcontent]]
