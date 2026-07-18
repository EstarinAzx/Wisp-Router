---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**On `main` at `df913e6`, tagged `v2.0.15`, released and installed. Nothing in
flight.** The #111 cache follow-up cycle (2026-07-17/18) is fully shipped: cache
breakpoints spread across fat tool turns, forward-slide hardening past
bare-string runs, 1h cache TTL, and `tool_result.is_error` passthrough — all
merged, released via release.yml (green, all four runners), npm has 2.0.15, the
global `claude-wisp` binary was reinstalled and confirms v2.0.15 on the splash.
The 1h TTL was live-verified against the real Claude.ai OAuth endpoint (Bridge
from source, one bridged `-p` round-trip, accepted — no 400). Feature branches
deleted local + remote. Anthropic-OAuth quota parity with native Claude Code is
believed complete.

## What last session did — ship v2.0.15

1. Reviewed the stacked review branch diff (no findings), fresh-verified
   (compile clean, 477 tests), fast-forward merged to `main`, pushed.
2. Cleared the pre-release caveat: live bridged round-trip through the
   Anthropic-OAuth path with the new body builder — endpoint accepted
   `ttl:'1h'` markers.
3. Release prep: `packages/tui/package.json` 2.0.14→2.0.15, span-baseline
   recaptured (32 Screens), `packages/tui/CHANGELOG.md` entry, commit
   `df913e6`, tag `v2.0.15` pushed → release.yml green → npm publish →
   `npm i -g wisp-router@2.0.15`.
4. Deleted both `claude/*rehydration*` branches.

## Next task — none mandatory; backlog if idle

No queued work. Candidates, all deliberately held (fidelity/UX, not bugs):

- **thinking / redacted_thinking preservation — HELD, risky to do casually.**
  Anthropic requires thinking blocks passed back byte-for-byte with signatures
  intact; Wisp also routes to non-Anthropic backends where they must be
  dropped; `NormalizedTurn` has no thinking slot. Architecturally significant
  (CLAUDE.md §3) — needs a design pass (`/hp` or grill), NOT a quick patch.
  Discuss before implementing.
- **`document`/PDF passthrough — HELD.** Feature, not bug: `splitUserBlocks`
  drops `document` blocks silently. Needs a new normalized slot + backend
  capability check. Only worth it if users actually feed PDFs.
- **TUI model-switch cache warning — backlog, speculative.** Surface a
  heads-up in `/routing` (`routingScreens.tsx`) when re-pointing the MAIN-LOOP
  target of an active session (model switch cold-writes the model-scoped
  cache). Low value; build only if someone actually hits it.

## Landmines

- Release checklist (for any future `v2.x`): bump `packages/tui/package.json` →
  recapture span-baseline (`bun scripts/span-baseline.tsx --update` from
  `packages/tui`) → update `packages/tui/CHANGELOG.md` → tag must equal the
  package.json version or release.yml refuses. Changelog split is policy:
  vscode changelog is extension-only.
- `wisp --version` doesn't exist — it launches the TUI; version is on the
  splash.
- Live-testing the Bridge from source: check port 41184 is free first (an
  installed-binary Bridge would be a stale-code listener and #63 loud-fail on
  double-start); `bun packages/tui/src/index.tsx serve`, then
  `bun packages/tui/src/claude-wisp.ts -p "..."` from a neutral cwd.
- `plugins/slot/**` edits need `claude plugin update wisp-slot@wisp-router`.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
