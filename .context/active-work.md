---
type: active-work
project: wisp
updated: 2026-06-23
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-23 by Opus 4.8 (auto)._
_At commit: `b87af33` + uncommitted slice-#28 work on branch `feat/anthropic-oauth` (off `main`).
`CLAUDE.md` still uncommitted — pre-existing ecosystem-KB/handoff/trace edit, unrelated; NOT part of #28,
decide separately._

## Current focus
**Anthropic OAuth Provider — slice #28 (tracer) is DONE and HITL-verified.** A Claude.ai (Pro/Max)
subscriber signs in to Wisp over OAuth and runs one **Inquire** edit through Claude on the Anthropic
**Messages API** — the third Provider **kind** (`kind:'anthropic-oauth'`) alongside API-key and Codex.
Next is slice **#29** (native chat streaming).

## State
- **Done this session (#28):** new `src/anthropicAuth.ts` (PKCE S256 + CSRF state, OS-assigned loopback,
  slot `wisp.anthropicAuth`, JSON token exchange, scope-omitting refresh w/ 5-min skew, `{}` tombstone) +
  `src/anthropicClient.ts` (Messages `POST /v1/messages`, non-streaming, text-block extract). Pure cores +
  the **client fingerprint** in `catalog.ts` (TDD, `anthropic.test.ts` 18 tests; `npm test` **159/159**).
  Wired into `extension.ts` (row, singleton, getState, sign-in/out commands, Inquire dispatch),
  `sidePanelProvider.ts` + `webview/app.tsx` (one sign-in block generalized to both OAuth kinds),
  `package.json` (commands + `anthropic` enum). tsc + webview + vite clean. **F5: OAuth sign-in + one
  Inquire edit PASSED.**
- **In flight:** nothing mid-edit. Slice #28 is complete; not yet committed (branch ready, see Pick up).
- **Blocked:** none for #29.

## Pick up here
1. **Commit #28 first** (if `/preset wrap-up` didn't finish it): on branch `feat/anthropic-oauth`, stage the
   `src/anthropic*` files + the `catalog.ts`/`extension.ts`/`sidePanelProvider.ts`/`webview/app.tsx`/
   `package.json` edits + `.context/`, conventional commit. Do NOT stage `CLAUDE.md`. Then `/preset ship` → PR.
2. **Implement slice #29** — `gh issue view 29 --comments`. Native **chat streaming** for Anthropic: an
   `anthropicStream` async-generator over the Messages **SSE** (`content_block_delta` → text), wire
   `isAnthropicProvider` into `chatProvider.ts` (advertise-when-signed-in like Codex, caps, a bespoke
   Messages adapter — NOT the OpenAI chat client). Mirror `codexStream`/`codexClient` structure.
3. **#29 verification is HITL** — needs the real Claude.ai account + the Ctrl+I/chat picker.

## Skills for next session
- superpowers:test-driven-development — the SSE reducer's pure logic wants a red-green loop (prior art
  `codex.test.ts` reduceResponsesTextEvents).
- /preset scope — to enter #29 (restate, plan files, go/no-go).

## Open questions
- **Model `claude-opus-4-8` on the subscription path** — it WORKED for #28's Inquire, so opus-4-8 is served
  on the Claude.ai OAuth path (openclaude defaults subscribers to opus-4-6/sonnet-4-6, but 4-8 is accepted).
  No action needed; noted in case a future model 429s (swap to `claude-sonnet-4-6`).
- **Dispatch-registry refactor** still deferred (only 2 OAuth kinds). Revisit if/when xAI lands a 3rd kind.
- **`NATIVE_CLIENT_ATTESTATION`** (the `cch` token) still a dormant kill-switch Wisp (Node) can't reproduce;
  unenforced today — #28 works without it. Known ceiling, not a blocker.

## Recent context
- **The 429 saga (now resolved) defines the Anthropic request contract.** OAuth sign-in worked first try,
  but the first Inquire 429'd with a *synthetic* `rate_limit_error` (no `anthropic-ratelimit-*` headers,
  generic `"message":"Error"` body — the tell). Root cause: the subscription Messages backend validates a
  per-request **client fingerprint** and three recognition signals, none of which the bare request carried.
  Fixed in `anthropicClient.ts` — see [[decisions]] 2026-06-23 and [[gotchas]] "Anthropic OAuth: synthetic
  429 …". This **sharpens** the recon's abstracted "recognition = … billing header" ([[oauth-recon]] §5e).
- openclaude remains the verified reference (`D:/.claude/claude projects/openclaude`); the fingerprint
  recipe + headers were extracted from its actual Messages request code.

## Related
- [[overview]]
- [[oauth-recon]] — the design source of truth for this feature
- [[decisions]] — 2026-06-23 #28-built entry (the fingerprint contract)
- [[gotchas]] — the synthetic-429 / fingerprint trap; F5 dup-extension trap
