---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Where you are

**On `main` at `971cefd`, tagged `v2.0.17`, released and installed. Nothing in
flight.** Three ship cycles landed 2026-07-18: v2.0.15 (cache follow-ups),
v2.0.16 (PDF passthrough), and **v2.0.17 — thinking passthrough, the last
fidelity gap, closed.** `thinking`/`redacted_thinking` blocks round-trip
client ↔ Anthropic: raw-sidecar verbatim replay outbound (signatures +
interleaved order intact, client cache_control shed), live thinking SSE frames
inbound (incl. the OAuth wire's empty-text signed blocks via `thinkingStart`).
Claude 5 (fable-5/sonnet-5) joined the effort regexes — /effort reaches the
default model now, at every level through `max`. Grilled first (7 decisions —
see [[2026-07-18-thinking-passthrough-raw-sidecar]]), TDD (498 core tests, was
481), review-fixed (stream-position tool yields; sidecar cache strip),
live-verified end to end on opus-4-8 AND fable-5 incl. tool continuation,
cross-model replay, and codex smoke. **Anthropic-OAuth path now believed at
full quota + fidelity parity with native Claude Code.**

## What last session did — ship v2.0.17

1. `/preset pick-up` → grill (7 locked decisions) → TDD build across
   parse/body-builder/stream/encoder/reply → cavecrew review (2 real bugs
   fixed, 2 findings overruled with live evidence) → live probes → release.
2. Live probes against the real OAuth endpoint (probe scripts pattern:
   scratchpad `probe-direct.ts`/`probe-continue.ts`/`probe-door-continue.ts`
   using the REAL `buildAnthropicMessagesBody`): endpoint emits EMPTY-text
   signed thinking blocks; tolerates foreign signatures (200), stripped
   thinking (200); Claude 5 accepts adaptive+effort through max (200).
3. Release: bump 2.0.16→2.0.17, span-baseline recaptured, tui CHANGELOG,
   tag `v2.0.17`, release.yml green ×4 + publish, `npm i -g` confirmed.
4. Branch `claude/thinking-passthrough` merged fast-forward + deleted.

## Next task — none mandatory; backlog if idle

- **Real-world soak** — fidelity now verified by probes; the true test is
  daily-driving wisped fable through long agentic sessions (interleaved
  multi-thinking turns). If a session bricks on a 400 mentioning
  thinking/signature: capture the request body, re-run the scratchpad-style
  probes, only then consider strip-retry (deliberately skipped — endpoint
  tolerates today).
- **Codex reasoning → thinking blocks out the Anthropic door** — backlog,
  grill-first (unsigned fabricated blocks get resent by clients; reason the
  loop through before building).
- **TUI model-switch cache warning** — backlog, speculative, build only if hit.

## Landmines

- Release checklist: bump `packages/tui/package.json` → span-baseline
  (`bun scripts/span-baseline.tsx --update` from packages/tui) → tui
  CHANGELOG → tag == package.json version or release.yml refuses.
- PS 5.1 `Set-Content -Encoding utf8` writes a BOM — package.json got one this
  session and needed a BOM-less rewrite. Prefer `[IO.File]::WriteAllText` with
  `UTF8Encoding($false)` for files npm reads.
- Bridge from source: port 41184 must be free; killing the background wrapper
  orphans the bun server — kill the PID from
  `Get-NetTCPConnection -LocalPort 41184 -State Listen`.
- Thinking-only turns on the OpenAI door / vscode chatProvider render as
  silent empty completions (those doors drop thinking; accepted ceiling).
- `wisp --version` doesn't exist — version is on the TUI splash.
- `plugins/slot/**` edits need `claude plugin update wisp-slot@wisp-router`.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]]
- [[2026-07-18-thinking-passthrough-raw-sidecar]]
