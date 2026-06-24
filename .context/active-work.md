---
type: active-work
project: wisp
updated: 2026-06-24
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-24 by Opus 4.8 (auto)._
_At commit: uncommitted (Bridge #40 + the (b) Copilot-label change this session, on branch `feat/bridge`)._

## Current focus
**The Bridge is feature-complete** (PRD #34). Wisp's outward-facing local OpenAI-compatible endpoint now reaches
**all three** Provider kinds — keyed, Codex (#39), and **Anthropic (#40, this session)** — and the GitHub Copilot
CLI drives a real coding task through it. Slices #35–#40 all landed. Next: **release** (the last open slice is the
parent PRD #34 itself) plus one cosmetic follow-up surfaced this session.

## State
- **Done this session:**
  - **#40 (Anthropic over the Bridge) — BUILT + LIVE-VERIFIED.** Pure mirror of #39, swapping Codex cores for
    Anthropic. Files: `src/bridgeServer.ts`, `src/extension.ts`.
    - `bridgeServer.ts`: `BridgeDeps` gained `anthropicSignedIn`/`anthropicCreds`. `/v1/models` anthropic row
      flipped `false` → `await deps.anthropicSignedIn()`. New **`handleAnthropicChat`** drives **`anthropicStream`**
      (Messages SSE) with `anthropicCreds()`, **raw** `deps.effort()` (body builder maps it), `toAnthropicTools`,
      `parsed.system` re-attached as a leading `role:'system'` message (body builder lifts to top-level `system`),
      images dropped. No creds → **401**, stream throw → **502**. `handleChat` routes anthropic → it (was 400 stub).
    - `extension.ts`: wired `anthropicSignedIn`/`anthropicCreds` into `createBridgeServer` (getters already existed).
    - **Verified:** live `Invoke-RestMethod` with `model:'anthropic'` → `finish_reason=stop`, real text back
      through the Claude.ai subscription. Codex still green (no regression).
  - **(b) Copilot CLI shows the real model name — BUILT + VERIFIED END-TO-END.** 5 edits across the two files.
    - `injectCopilotEnv`: `COPILOT_MODEL` = `activeModel()` (resolved model name) instead of `activeProvider().id`.
      Config handler re-syncs it on provider **or** model switch. `createBridgeServer` gained `activeProviderId`.
    - `bridgeServer.ts`: `BridgeDeps` gained `activeProviderId`; `handleChat` routing now: Provider id → that
      Provider (curl keeps explicit addressing); **any other value (the resolved model name) → active Provider**
      (loose fallback). See [[decisions]] for the tradeoff.
    - **Verified live with the REAL Copilot binary** (`@github/copilot` v1.0.64) against the compiled
      `out/bridgeServer.js` (stood up in a node harness, upstream client mocked): Copilot's JSON event stream
      reported `data.model: "minimax-m3"` (the resolved name, not the Provider id) and round-tripped
      (`apiCallId: chatcmpl-…` = our Bridge). Also a 3/3 routing-fallback HTTP harness.
  - **PRD happy path PROVEN this session:** a real Copilot CLI session (`copilot` in a Bridge-env terminal) drove
    a task through the Bridge on the Claude.ai subscription — acceptance #5 of #39/#40, open since #35.
  - **Checks:** `tsc` clean, **234 tests green**, full `npm run compile` clean.
- **In flight:** nothing — clean stopping point.
- **Blocked:** nothing.

## Pick up here
**Release the Bridge.** All slices done; PRD #34 is the only open issue. Bump version (last was 1.3.0 → likely
1.4.0), update `CHANGELOG.md` + `README.md` (Bridge feature + Copilot CLI BYOK setup), package the vsix, close #34.
**Then** the one follow-up surfaced this session (small, same touch point — `injectCopilotEnv`):
- **Copilot CLI catalog warning:** `Model "<x>" is not in the built-in catalog. Using defaults for token windows.`
  Inject `COPILOT_PROVIDER_MAX_PROMPT_TOKENS` / `COPILOT_PROVIDER_MAX_OUTPUT_TOKENS` from the real model caps
  (`anthropicModelCaps`/`codexModelCaps`/models.dev) so windows are correct and the warning dies. Optional polish.

## Skills for next session
- /preset ship — push `feat/bridge`, open the PR (this session's commit is local only).
- /preset scope — if starting the release as its own task.

## Open questions
- **Streaming + tool-calls over the Bridge for Anthropic not explicitly run** — only non-stream text was live-hit.
  Same upstream/render path as Codex (which ran both via the Copilot session), so low risk; confirm on next F5 if
  paranoid.

## Recent context
- **The `model` field is a router, not just a name (#b):** a Provider id addresses that Provider; anything else
  serves the **active Provider**. Copilot sends the resolved model name → routes to active. curl can still hit
  `codex`/`anthropic`/`opencode-go` by id explicitly.
- **Provider switch needs a new terminal; model/effort are live** (Bridge re-reads the panel per request). The
  Copilot **label** is a launch-time snapshot of `COPILOT_MODEL`; the model **used** is always live.
- **The standalone GUI Copilot app does NOT route through the Bridge** — env is injected into VS Code terminals
  only. Use `copilot` in a new terminal opened after Start. See [[gotchas]].
- **Testing from PowerShell:** `Invoke-RestMethod`, not `curl.exe`. `message=;` is display collapse, not empty —
  read `.choices[0].message.content`. See [[gotchas]].
- **Before any F5:** uninstall `local.wisp` (stale-panel dup trap); open a NEW terminal after Start. See [[gotchas]].

## Related
- [[overview]]
- [[happy-path]] — the Bridge golden-path MVD
- [[api]] — Bridge endpoints (all 3 kinds route now), `COPILOT_*` env, `wisp.bridge.secret` slot
- [[decisions]] — 2026-06-24 (#40 Anthropic send-path), 2026-06-24 (#b Copilot model label + routing)
- [[gotchas]] — PowerShell curl trap, F5 dup trap, new-terminal env trap, GUI-app-no-Bridge trap
