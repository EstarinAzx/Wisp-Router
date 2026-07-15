---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Opus 4.8 (auto)._
_At commit: `a903981` on `main` (Grok #92–#97 merged). #98 release-prep on branch `ticket/98-release-2.0.5` / PR #105 (unmerged)._

## Current focus
**Grok (xAI OAuth) provider is BUILT + LIVE-VERIFIED — epic #91, 6 of 7 slices shipped.** Only the
**release (2.0.5)** remains, and it's deliberately **human-gated** (irreversible npm publish). The
`/loop /preset ticket-loop` self-promoting chain walked #92→#97 in one session; #98 is prepped in a PR,
awaiting the tag. See [[2026-07-15-grok-xai-oauth-provider-shipped-live-verified]].

## State
- **Shipped to `main` this session (Grok epic #91):**
  - **#92** catalog foundation — PR #99 → `509f753` (kind `xai-oauth`, 13th built-in Grok row, `XaiCreds` + pure helpers, `WispAuth.xai`).
  - **#93** XaiAuth OAuth manager — PR #100 → `8146081` (`xaiAuth.ts`, PKCE loopback `127.0.0.1:56121`, OIDC discovery D7, `~/.grok` import D6; pure `parseGrokAuthJson`/`isXaiEndpoint`).
  - **#94** Grok client — PR #101 → `a21382b` (`xaiClient.ts` `xaiStream`/`xaiRequest`, Codex-twin Responses; `isGrokCliProxyModel`/`xaiResponsesUrl`/`xaiRequestHeaders`/`xaiReasoning`/`rewriteXaiResponsesPayload`).
  - **#95** Bridge dispatch — PR #102 → `93c83c2` (both doors; `handleXaiChat` + `startProviderStream` xai arm; **first `bridgeServer.test.ts`**; deps optional).
  - **#96** TUI face — PR #103 → `528cfde` (`xaiAuth` in store, Bridge deps, `/signin xai`/`/test`, slash hint).
  - **#97** VS Code face — PR #104 → `a903981` (extension `XaiAuth` + commands + Bridge/chat deps + Inquire arm; `chatProvider` arms; side panel + webview; package.json commands).
- **LIVE-VERIFIED (the deferred check, now done):** via `claude-wisp` (Bridge Anthropic door), **grok-4.5** (public api.x.ai) AND **grok-build** (subscription proxy + `x-grok-*` headers) both stream real replies. The best-effort `x-grok-client-identifier`/`-version` (`grok-cli`/`1.0.0`) are **confirmed working**.
- **Tests: 387 → 431** (`bun run test`); vscode + webview + TUI `tsc` clean throughout.

## In flight
**#98 release-prep — PR #105 (branch `ticket/98-release-2.0.5`), NOT merged.** Contains: `packages/tui/package.json` → **2.0.5**, CHANGELOG Grok entry, README 12→13 built-ins + Grok section. Left unmerged on purpose — the tag/publish is the human's call.

## Blocked
None. (The release is a human decision, not a blocker.)

## Pick up here
**Finish the release** (human gate, live checks already passed):
1. Merge **PR #105** → `git tag v2.0.5 && git push --tags`.
2. Watch `gh run list --workflow release.yml` for the `v2.0.5` run → **green**; confirm `npm view wisp-router version` → **2.0.5**.
3. On green, **close epic #91** and its issue.
4. If the run/publish fails, **registry-probe before blaming CI**: `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64` — a burned version can never be republished.

## Landmines
- **npm publish is irreversible** — a burned `2.0.5` can't be reused. Verify before tagging.
- **Rotate `NPM_TOKEN`** (repo secret) if it hasn't been — pasted in-session previously.
- **Grok ≠ Groq** — Grok is `id:'xai'` (OAuth); do not disturb the `id:'groq'` row (Llama, API-key).
- Codex signed out on this machine (`/signin codex` before any Codex live checks).
- Carried backlog (post-release): VS Code extension 1.7.0 (CHANGELOG `[Unreleased]` now also holds the Grok entry); root `.vsix` pile (ask before purging); panel-side alias rename (TUI-only).

## Open questions
- (carried) grok-4.5 rides the public `api.x.ai` lane — it *works*, but whether xAI **bills** it under SuperGrok or as metered API usage is unverified (untestable from here).
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- New core files this epic: `xaiAuth.ts`, `xaiClient.ts`; new pure cores in `catalog.ts` (search `xai`/`grok`); `WispAuth.xai` slot in `home.ts`; barrel updated. New tests: `xai.test.ts`, `bridgeServer.test.ts`; touched `catalog.test.ts`/`home.test.ts`/`slash.test.ts`.
- Face wiring: `packages/vscode/src/{extension,chatProvider,sidePanelProvider}.ts` + `webview/app.tsx` + `package.json`; `packages/tui/src/{store,bridge,app}.tsx`.
- Repo labels: `ready-for-agent` (frontier) / `ready-for-human`. Ready queue is **empty**; #98 is `ready-for-human`.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
