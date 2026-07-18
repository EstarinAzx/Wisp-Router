---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**On `main` at `ff35e66`, tagged `v2.0.16`, released and installed. Nothing in
flight.** Two ship cycles landed 2026-07-18: the #111 cache follow-ups as
v2.0.15 (breakpoint spread, forward-slide hardening, 1h TTL, is_error — TTL
live-verified against the real OAuth endpoint), then **PDF passthrough as
v2.0.16** — base64 `document` blocks now ride the Anthropic door (top-level
user blocks AND hoisted out of `tool_result` content, mirroring images), built
TDD (4 new tests, 481 total green) and live-verified: a generated PDF fed
through the source Bridge came back read correctly (`WISP PDF TEST 42`).
Anthropic-door only — a PDF routed to Codex/xAI/Go targets is still dropped.
npm has 2.0.16, global binary reinstalled. Quota parity with native Claude
Code believed complete; fidelity now too, except thinking blocks.

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

No queued work. Candidates, deliberately held:

- **thinking / redacted_thinking preservation — the last fidelity gap, HELD,
  risky to do casually.** User wants wisped Claude uncapped, so this WILL come
  up. Anthropic requires thinking blocks passed back byte-for-byte with
  signatures intact; Wisp also routes to non-Anthropic backends where they
  must be dropped; `NormalizedTurn` has no thinking slot. Architecturally
  significant (CLAUDE.md §3) — start with a design discussion (grill/`/hp`),
  NOT a quick patch. Agreed 2026-07-18: grill first when the user asks.
- **PDF passthrough — DONE in v2.0.16** (base64 documents, Anthropic door;
  Codex/xAI/Go targets still drop them — extend only if a backend gains PDF
  support).
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
  `bun packages/tui/src/claude-wisp.ts -p "..."` from a neutral cwd. Or curl
  the door directly: `x-api-key: <bridgeSecret from ~/.wisp/auth.json>` +
  `anthropic-version` header on POST /v1/messages.
- **Killing a background-started Bridge: TaskStop/shell-kill only gets the
  wrapper — the bun server survives as an orphan holding 41184.** Find and
  kill the real PID: `Get-NetTCPConnection -LocalPort 41184 -State Listen` →
  `Stop-Process -Id <OwningProcess>`.
- `plugins/slot/**` edits need `claude plugin update wisp-slot@wisp-router`.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
