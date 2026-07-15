---
type: decision
project: wisp
updated: 2026-06-23
tags: [context, decisions]
---

# Anthropic tool-calling parity (slice #30); the toolCalling flag is now honest

**Decision:** Wired real tool calling for the Anthropic chat branch — forward agent tools, round-trip
`tool_use`/`tool_result` content blocks — making the `toolCalling:true` flag (advertised since #29 for picker
visibility) **honest**. New pure cores in `catalog.ts` (TDD, `npm test` **187/187**): `toAnthropicTools`,
`reduceAnthropicToolCalls`, extended `AnthropicMessage` (`toolCalls`/`toolResults`) + `buildAnthropicMessagesBody`
(content-block expansion + `tools`/`tool_choice`), `parseToolInput`. `anthropicClient.ts`: `AnthropicStreamEvent`
→ `{text}|{toolCall}` union, tools threaded, `anthropicStream` collects `content_block_start`/`content_block_delta`
and folds via the reducer at stream end. `chatProvider.ts`: Anthropic branch forwards `options.tools` + maps
`toolMode`→`tool_choice`, emits `LanguageModelToolCallPart`; `toAnthropicMessages` carries the round-trip. Mirrors
Codex #15. **F5 PASSED** — Claude fired 5 parallel `Read` calls, results round-tripped, loop completed.

**The load-bearing facts — Anthropic's Messages tool wire format differs from Codex's Responses format** (these
are the live contract, confirmed against the API + the openclaude reference, not preferences):
1. **No strict-schema closure.** Anthropic accepts a plain JSON `input_schema` — NO `additionalProperties:false` /
   required-all-keys. `toAnthropicTools` passes the schema through verbatim (do NOT port Codex's
   `enforceStrictResponsesSchema`; it's unneeded and Anthropic doesn't require it).
2. **`tool_choice` is an OBJECT** `{type:'auto'|'any'}` — not Codex's string `'auto'|'required'`. VS Code
   `Required`→`'any'`.
3. **Parallel calls are SIBLING `tool_use` blocks inside ONE assistant turn's content array** (after the optional
   leading text block) — not separate items. Codex emits flat `function_call` items instead.
4. **`tool_use` block `input` is a PARSED object** (Codex round-trips the raw JSON string). `parseToolInput`
   parses `argsJson`, degrading bad/partial JSON to `{}`.
5. **Streaming keys by content-block `index`** (`content_block_start.content_block.type==='tool_use'` carries the
   `toolu_` id+name; `content_block_delta.delta.type==='input_json_delta'` accumulates `partial_json`) — Codex
   keys by item id.
6. **User turn = `tool_result` block FIRST, then text** (the API requires the assistant-tool_use → user-tool_result
   adjacency).

**The #28 fingerprint contract survived untouched** — `firstUserMessage` is still sourced from the first
non-system turn's `.content` TEXT; `tools` ride as a separate top-level body key, never the system attribution
block; the fingerprint samples only first-user-message text, not body fields. #30's tools rode the subscription
path with no synthetic-429 — partial evidence the deferred thinking/effort fields (their own slice) will too,
but probe before shipping them.

**Adversarial review (20-agent workflow):** 0 code bugs; 3 coverage gaps confirmed → 2 regression tests added
(full round-trip ordering, multi-parallel `tool_use` blocks), 1 justified-skip (the `chatProvider` `toolMode`
seam — a vscode-importing non-pure module deliberately kept out of the pure unit suite, same as Codex; the
`'auto'|'any'` union type catches a copy-paste `'required'` at compile time).

**Reversibility:** the cores are additive (easy to drop). But the six wire-format facts are the live contract —
don't "simplify" Anthropic tools toward the Codex/strict shape, or the backend rejects them. Images stay deferred
(own follow-up). Reference: openclaude `src/utils/api.ts`, `src/services/api/claude.ts`, `src/utils/messages.ts`.

## Related

- [[decisions]] — index
