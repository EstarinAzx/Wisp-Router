---
type: decision
project: wisp
updated: 2026-06-19
tags: [context, decisions]
---

# Codex tool-calling parity (slice #15): the toolCalling flag is now honest

**Decision:** Wire real tool calling for the Codex chat branch — forward agent tools and round-trip tool
calls/results — making the `toolCalling: true` flag (flipped in #14 only for picker visibility) **honest**.
Three new/extended pure cores in `catalog.ts` (TDD, `npm test` **137/137**) + a stream-type widening:
1. **`toCodexResponsesTools`** — VS Code tool defs → **flat** Responses function tools
   (`{type,name,description,parameters,strict:true}`, unlike chat completions' nested `function` object).
   A self-contained recursive `enforceStrictResponsesSchema` closes every object
   (`additionalProperties:false`) and lists **all** its keys in `required` — Codex **strict** tools reject
   any open/partial object. (Mirrors XETH-7 `convertToolsToResponsesTools`, minus its
   `sanitizeSchemaForOpenAICompat`/`uri`-format/empty-record edge handling — not needed for VS Code tools.)
2. **`reduceResponsesToolCalls`** — the Responses analogue of `assembleToolCalls`. Accumulates
   `response.output_item.added` (function_call id/call_id/name + optional initial args) +
   `response.function_call_arguments.delta` (arg fragments) keyed by **item id**, and surfaces **call_id**
   as the round-trip id. Returns `AssembledToolCall[]` (reusing #14's type).
3. **`buildCodexResponsesBody` extended** — assistant tool calls → `function_call` input items, tool
   results → `function_call_output` items, ordered per API (function_call_output **before** the next user
   message). `tools`/`tool_choice`/`parallel_tool_calls` ride only when tools are non-empty (a bare
   tool_choice with no tools 400s). The old empty-text message fallback is gone: a message item is emitted
   only when it has parts, so a tool-only turn yields just its function_call / function_call_output items.
4. **`codexStream` yield `string` → `CodexStreamEvent` union** (`{type:'text'} | {type:'toolCall'}`).
   Function-call events stream interleaved with text but can't be emitted until whole, so they are collected
   and folded by the reducer at stream end (the chat-completions assemble-at-end pattern). `chatProvider`
   threads `options.tools`/`toolMode` in and maps the union to `LanguageModelTextPart` /
   `LanguageModelToolCallPart`; `toCodexMessages` now carries `toolCalls`/`toolResults`.

**The load-bearing live finding — replayed `function_call` items need only `call_id`, NOT `id`:** the F5
round-trip succeeded sending the `function_call` input item with **`call_id` only** (the documented
stateless Responses contract). XETH-7 additionally sends a derived `id` (`fc_…`); it is **unnecessary** here
(`store:false` is stateless, so there is no prior server item to reference). Kept call_id-only per CLAUDE.md
simplicity. If a future round-trip 400s, adding `id` to the item is the one-line fix — see [[gotchas]].

**Why:** #14 made the `toolCalling` flag a bounded white lie (advertised true for visibility; tools ignored
→ Codex answered as text). #15 forwards the tools and round-trips the results, so agent mode actually drives
Codex — closing the honesty gap. **F5 PASSED:** Codex (gpt-5.5) fired **5 parallel `Read` tool calls** in
one turn, VS Code ran them, results round-tripped, and the summary reflected the real file contents — proving
the model→tool→result→continue loop *and* that call_id-only is sufficient.

**Reversibility:** the cores are additive (easy to drop). But the strict-schema enforcement and the
call_id-only round-trip are the live contract — don't loosen strict (Codex 400s open objects) or "simplify"
by also re-closing the empty-text message fallback (it would emit empty messages on tool-only turns).
Reference: `XETH--7` `codexShim.ts` (`convertToolsToResponsesTools`, `convertAnthropicMessagesToResponsesInput`,
the `output_item.added` / `function_call_arguments.delta` handling). See [[gotchas]].

## Related

- [[decisions]] — index
