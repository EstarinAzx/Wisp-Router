---
type: active-work
project: wisp
updated: 2026-06-24
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-24 by Opus 4.8 (auto)._
_At commit: uncommitted (Bridge #37 staged this session, on branch `feat/bridge`)._

## Current focus
**Building the Bridge** (PRD #34) — Wisp's outward-facing local OpenAI-compatible endpoint, so the GitHub
Copilot CLI (and curl, and any OpenAI client) can drive a coding task through any Wisp Provider. The two
foundation slices (#35 gate, #36 translator) landed last session; this session the **HTTP listener (#37)**
is built and **live-verified**. Next is the side-panel UI (#38), then the two subscription send-paths.

## State
- **Done this session:**
  - **#37 (HTTP listener + keyed walking skeleton) — BUILT + LIVE-VERIFIED.** New `src/bridgeServer.ts`
    (impure glue over the pure `bridge.ts`; node `http` stdlib, no new dep) + wiring in `src/extension.ts`
    + `wisp.bridge.port` setting + `wisp.bridgeToggle` command in `package.json`. Binds `127.0.0.1`, Bearer
    on every request (constant-time), `POST /v1/chat/completions` (SSE **and** a non-stream aggregate),
    `GET /v1/models`. `tsc` clean, **234 tests still green** (listener is glue → not unit-tested per PRD).
    **Live F5 passed:** real SSE round-trip through `opencode-go` (text deltas, terminal `finish_reason:stop`,
    `[DONE]`). A 16-check scratchpad smoke also covered auth/routing/SSE/non-stream/400/404.
- **In flight:** nothing — clean stopping point.
- **Blocked:** nothing. #38–#40 are unblocked.

## Pick up here
**Start #38 — side-panel Bridge toggle + access secret + address.** → `/preset scope 38`.
1. Replace the temp constant secret (`BRIDGE_ACCESS_SECRET` in `extension.ts`) with an auto-generated,
   SecretStorage-backed secret; surface it + the `http://127.0.0.1:<port>` address in the panel with a copy
   button + a running/stopped indicator (PRD user stories 1–6, 15–17).
2. The panel switch calls the SAME `bridge.start()/stop()` the `wisp.bridgeToggle` command already drives —
   reuse, don't fork. `bridge.isRunning()` feeds the indicator.
3. This is also where #35's env-var injection lands (the 5 `COPILOT_*` vars via
   `context.environmentVariableCollection`), pointing the CLI at the live port + secret — which finally lets
   the #35 live confirm run for real (a Copilot CLI session reaching the Bridge, not just curl).
- After #38: Codex over the Bridge (#39), Anthropic (#40).

## Skills for next session
- /preset scope — to enter the work loop on #38.

## Open questions
- **#35's live Copilot-CLI confirm** — does a Copilot CLI session in a VS Code terminal actually inherit the
  injected `COPILOT_*` vars and reach the Bridge? curl proved the listener; the env-injection half is #38.

## Recent context
- **A non-streaming path was added beyond the pure translator** — when a client sends `stream:false`, the
  listener drains the upstream stream and answers one `chat.completion` object. `bridge.ts` stays
  streaming-only by design; the aggregate envelope is glue in `bridgeServer.ts`. Removes a `stream:false`
  foot-gun (any OpenAI client / plain curl works), not just SSE.
- **#37 secret is a temporary constant + a palette command drives the toggle** — the generated secret + panel
  switch are deliberately #38; the command (`wisp.bridgeToggle`) exists only as the #37 test driver and shows
  the address/secret in a toast.
- **The `model` field is a Provider id**, not a model name — `opencode-go`, not `opencode` (bare `opencode`
  404s as an unknown provider). `/v1/models` lists the usable keyed ids (verified: opencode-go, opencode-zen,
  openrouter were keyed this session).
- **PowerShell curl JSON gotcha** (cost a round-trip): PS 5.1 mangles double-quotes inside inline JSON passed
  to `curl.exe` → the body arrives as non-JSON → the listener's deliberate 400. Use `Invoke-RestMethod` (or a
  file body) for Bridge F5 tests. Added to [[gotchas]].
- Before any F5: uninstall `local.wisp` (stale-panel dup-extension trap). See [[gotchas]].

## Related
- [[overview]]
- [[happy-path]] — the Bridge golden-path MVD
- [[api]] — the new `wisp.bridgeToggle` command + `wisp.bridge.port` setting + Bridge endpoints
- [[decisions]] — 2026-06-24 (#37 build + the non-stream choice)
- [[gotchas]] — the PowerShell curl trap + the F5 dup-extension trap
