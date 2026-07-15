---
type: decision
project: wisp
updated: 2026-06-23
tags: [context, decisions]
---

# Anthropic native chat streaming (slice #29); model-spec 1M caps; effort deferred

**Decision:** Shipped Anthropic text streaming in the native chat / Ctrl+I picker. New pure cores in
`catalog.ts` (TDD, `npm test` **170/170**): `buildAnthropicMessagesBody` (the one tested body builder —
`anthropicInquire` refactored to share it; system→top-level block array led by the attribution, stream flag
optional), `anthropicTextDelta`/`reduceAnthropicTextEvents` (Messages SSE → text; `content_block_delta` →
`text_delta`, `error` event throws), `anthropicModelCaps`, the `SseEvent` alias + `AnthropicMessage` type.
`codexClient.ts` **exported `sseBlocks`** (the provider-agnostic chunk→block splitter, now shared).
`anthropicClient.ts` gained pure `anthropicMessagesHeaders` (testable recognition contract) + a shared
`anthropicMessagesRequest` + the `anthropicStream` generator. `chatProvider.ts` got `anthropicSignedIn`/
`anthropicCreds` deps, usability + caps branches, an Anthropic streaming branch (text-only), and
`toAnthropicMessages`; `extension.ts` wired the two getters. **F5 streaming chat PASSED.**

**Caps advertise the model-spec windows, not a conservative floor.** `anthropicModelCaps` returns
Opus/Sonnet 4.x = **1M** context (Opus 128K output, Sonnet 64K), Haiku 4.5 = 200K/64K — the real model
maxes (Claude API catalog; 1M is standard, no beta). Rejected a flat 200K "safe floor": its only upside
guards an *unverified, avoidable* case (the agent packs >200K **and** the subscription backend rejects),
while its downside is certain — Opus/Sonnet shown false and long chats truncated early on the OAuth-moat
feature. **⚠️ Caveat:** these are *model* maxes; the Claude.ai **subscription** Messages path the OAuth
token rides may cap below 1M — unverified. The picker number is a budgeting hint, so an oversized pack
surfaces as a (already-handled) backend error, not a silent lie. If the subscription path is observed to
cap lower, lower the opus/sonnet `contextInput` then.
**Why not tool-calling in #29:** scope — issue #29 is text streaming only; Anthropic tools (`tool_use`/
`tool_result` round-trip) are slice **#30**. The request forwards **no** `options.tools`; `toolCalling:true`
still advertised (required for picker visibility, same as Codex), honest once #30 lands.

**Deferred — thinking/effort parity (follow-up, NOT #29).** Codex has a panel Effort knob threaded into its
request (v1.2.0); Claude has none — `buildAnthropicMessagesBody` sends no `thinking` / `output_config.effort`,
so on Opus 4.8 chat replies run **thinking-OFF**, effort default. Claude supports adaptive thinking + effort
(low→max), so this is a real parity gap, deferred by choice. **Blocker before building it:** must probe that
the **subscription OAuth Messages path** accepts `thinking`/`output_config.effort` *without tripping the
synthetic-429 fingerprint contract* (#28) — adding body fields changes the shape the backend fingerprints.
**Reversibility:** the streaming cores + caps are additive (easy to drop). The 1M-over-200K call is soft
(one-number revert if the subscription path caps lower). Don't advertise `toolCalling` *and* forward tools
until #30; don't add `thinking`/`effort` fields without the subscription-path probe first.

## Related

- [[decisions]] — index
