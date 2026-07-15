---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Opus 4.8 (auto)._
_At commit: `c75a9e3` on `main` (pushed). `wisp-router@2.0.6` released to npm._

## Current focus
**Nothing in flight.** This session shipped a Bridge bugfix and released it. Ready queue empty; next
work is picked from the carried backlog below.

## State
- **Bridge non-streaming fix shipped + released as `wisp-router@2.0.6`.** The Anthropic door ignored
  `stream:false` and always returned SSE; Claude Code's `/model` validation is a non-streaming probe that
  reads `usage.input_tokens` off the JSON body → it crashed (`undefined is not an object (evaluating
  'B.usage.input_tokens')`). Door now honors `stream:false` with a JSON Messages reply carrying a `usage`
  block. **Unblocks `/model` selection AND assigning a Wisp alias to a subagent.** LIVE-VERIFIED: real
  Claude Code `/model kimi` switched clean. (`fix` a932d2a; new pure `buildAnthropicMessageResponse` in
  `bridgeAnthropic.ts` + a `parsed.stream` branch in `bridgeServer.ts`.)
  - **Release `wisp-router@2.0.6` (2026-07-15):** tag `v2.0.6` → `c75a9e3`; `release.yml` run
    `29412769271` **GREEN**. `wisp-router@2.0.6` + all 4 `@tsd47216/wisp-router-*@2.0.6` published.
- **VS Code extension 1.7.0 prepped but NOT published to Marketplace.** Version bumped 1.6.0→1.7.0,
  CHANGELOG `[Unreleased]` cut to `[1.7.0]` (Grok #91 + aliasOnly #67), `wisp-1.7.0.vsix` built at
  `packages/vscode/wisp-1.7.0.vsix`. The Bridge fix's CHANGELOG entry is in the extension `[Unreleased]`
  (ships in the next extension release). Marketplace `vsce publish` is the human's step (needs the
  `EsarinAzx` publisher PAT). **⚠️ Do NOT git-tag `v1.7.0`** — `release.yml` fires on `v*` and guards
  tag==`packages/tui` version (2.0.6), so a `v1.7.0` tag fails all 4 jobs. Extension ships via `.vsix`.
- **catalog.ts comments trimmed** (`373ea02`): 1398→1293 lines, comments only, code byte-identical.
- **Tests: 434** (`bun run test`); vscode + webview `tsc` clean.

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty. Pick from the carried backlog (top candidate first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in `packages/vscode`
   with the publisher PAT (or upload `wisp-1.7.0.vsix`). **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. **catalog.ts modularization** (DEFERRED, owner will init) — 4-file peel first, shared-kernel rule,
   green-to-green. Full plan: [[2026-07-15-catalog-ts-modularization-plan-deferred]].
3. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Landmines
- **Release rebase trap:** `/preset wrap-up` commits `.context/` handoff locally; if not pushed, next
  session's context commit diverges from origin's squash. This session's wrap-up commit IS pushed.
- **npm publish is irreversible** — 2.0.6 is spent; next npm release is 2.0.7+.
- **⚠️ Extension release ≠ `v*` tag.** A `v1.7.0` tag fires `release.yml` (TUI path) and fails the
  tag==tui-version guard. The extension ships as a `.vsix` / `vsce publish`, no git tag.
- **Grok ≠ Groq** — Grok is `id:'xai'` (OAuth); leave the `id:'groq'` row (Llama, API-key) alone.
- Codex signed out on this machine (`/signin codex` before any Codex live checks).

## Open questions
- (carried) grok-4.5 rides the public `api.x.ai` lane — works, but whether xAI bills it under SuperGrok
  or as metered API usage is unverified (untestable from here).
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- Bridge fix files: `bridgeAnthropic.ts` (`buildAnthropicMessageResponse` + `AnthropicMessageResponse`),
  `bridgeServer.ts` (`handleAnthropicMessages` branches on `parsed.stream`). Tests: `bridgeAnthropic.test.ts`
  (2 unit), `bridgeServer.test.ts` (1 door-level integration reproducing the `/model` probe).
- Release plumbing unchanged: `.github/workflows/release.yml` (tag `v*` → 4-runner build + npm publish).
- Repo labels: `ready-for-agent` / `ready-for-human`. Ready queue **empty**.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
