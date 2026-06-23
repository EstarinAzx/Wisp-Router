---
type: pick-up
project: wisp
updated: 2026-06-24
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` (rehydrate the project, then the Bridge build state).

**Last session (2026-06-24, branch `feat/bridge`):** Bridge slice **#37** — the HTTP listener + keyed walking skeleton.
- **#37 — BUILT + LIVE-VERIFIED.** New `src/bridgeServer.ts` (impure glue over the pure `bridge.ts`; node `http`
  stdlib, no new dep) + wiring in `src/extension.ts` + `wisp.bridge.port` setting + `wisp.bridgeToggle` command.
  Binds `127.0.0.1`, Bearer on every request, `POST /v1/chat/completions` (SSE **and** a non-stream aggregate),
  `GET /v1/models`. `tsc` clean, **234 tests green**, a 16-check smoke + a **live F5** (real SSE through
  `opencode-go`) passed. Rationale in [[decisions]] (2026-06-24).

**Next task — #38 (unblocked):**
`/preset scope 38` — the Bridge **side-panel toggle + access secret + address** (PRD user stories 1–6, 15–17).
1. Replace the temp constant `BRIDGE_ACCESS_SECRET` (in `extension.ts`) with an auto-generated, SecretStorage-backed
   secret; show it + the `http://127.0.0.1:<port>` address in the panel with a copy button + a running/stopped indicator.
2. The panel switch must call the SAME `bridge.start()/stop()` the `wisp.bridgeToggle` command already drives — reuse,
   don't fork. `bridge.isRunning()` feeds the indicator.
3. **#35's env-var injection lands here too** — the 5 `COPILOT_*` vars via `context.environmentVariableCollection`,
   pointing the Copilot CLI at the live port + secret. That is what finally lets the #35 live confirm run (a Copilot
   CLI session actually reaching the Bridge — curl already proved the listener).
After #38: Codex over the Bridge (#39), Anthropic (#40).

**Landmines / things to know:**
- The listener is **glue → F5/manual-verified, not unit-tested** (per PRD) — don't add a unit test for it; the pure
  `bridge.ts` is the test target. The #37 smoke is a throwaway in scratchpad, not committed.
- The `model` field is a **Provider id** (`opencode-go`), not a model name — bare `opencode` 404s.
- **Testing from PowerShell:** `curl.exe` mangles inline JSON → use `Invoke-RestMethod`. The PS-native incantation
  + the full trap are in [[gotchas]].
- **Before any F5:** uninstall `local.wisp` (stale-panel collision). See [[gotchas]].

Full state in [[active-work]]; the #37 design rationale in [[decisions]] (2026-06-24); traps in [[gotchas]]; the new command/setting/endpoints in [[api]].
