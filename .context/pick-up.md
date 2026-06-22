---
type: pick-up
project: wisp
updated: 2026-06-23
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate, then `.context/decisions.md`
(2026-06-23 entry) for the Anthropic request contract.

**Last session (2026-06-23):** Built + HITL-verified **slice #28 — Anthropic OAuth tracer**. A Claude.ai
subscriber signs in over OAuth and runs one Inquire edit through Claude on the Messages API
(`kind:'anthropic-oauth'`). New `src/anthropicAuth.ts` + `src/anthropicClient.ts` + `src/anthropic.test.ts`
(18 tests; `npm test` 159/159); pure cores + the client fingerprint in `catalog.ts`; wired into
`extension.ts` / `sidePanelProvider.ts` / `webview/app.tsx` / `package.json`. **F5 PASSED.** Committed on
branch `feat/anthropic-oauth` (off `main`).

**Next task: slice #29** — Anthropic native **chat streaming**. Enter with **`/preset scope 29`** before
code. `gh issue view 29 --comments`. Build an `anthropicStream` async-generator over the Messages **SSE**
(`content_block_delta` → text), wire `isAnthropicProvider` into `chatProvider.ts` (advertise-when-signed-in
like Codex + caps + the bespoke Messages adapter, NOT the OpenAI chat client). Mirror `codexStream` /
`codexClient`. Pure SSE reducer → TDD it (prior art `codex.test.ts` reduceResponsesTextEvents).

**Landmines / things to know:**
- **The 429 contract is load-bearing** — the Messages backend validates a server-side **client fingerprint**;
  a request without `anthropic-beta: claude-code-20250219,…` + the `claude-cli/0.19.0` UA + the
  `x-anthropic-billing-header` first system block (with the computed `<fp>`) gets a *synthetic* 429 (no
  `anthropic-ratelimit-*` headers = the tell). #29's streaming request needs the SAME headers + attribution
  block. Reuse `anthropicAttribution` from `catalog.ts`. See [[gotchas]] "Anthropic OAuth: …fingerprint".
- **#29 is Messages-API, NOT OpenAI-compatible** — bespoke SSE adapter, like Codex's Responses adapter.
- **#29 verify is HITL** — real Claude.ai account + the Ctrl+I/chat picker.
- **`CLAUDE.md` still uncommitted** (pre-existing, unrelated) — NOT part of #28/#29; decide separately.
- **Before any F5:** uninstall `local.wisp` (stale-panel collision). See [[gotchas]].

Full state in [[active-work]]; the verified design in [[oauth-recon]]; the request contract in [[decisions]]
(2026-06-23); traps in [[gotchas]]; domain language in `CONTEXT.md`.
