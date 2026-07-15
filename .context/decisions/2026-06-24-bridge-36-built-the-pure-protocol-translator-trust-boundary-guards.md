---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Bridge #36 built: the pure protocol translator (+ trust-boundary guards from review)

**Decision:** Shipped slice #36 — `src/bridge.ts` + `src/bridge.test.ts`, a pure, vscode-free protocol
translator joining the `catalog.ts` family (TDD, `npm test` **234 green**, tsc clean). Three jobs:
- **Inbound** `parseOpenAiChatRequest(body)` → `{ model, stream, system, turns: NormalizedTurn[], tools: ToolSpec[] }`
  — the inverse of `buildOpenAiChatMessages` (+ `toOpenAiTools`). **System is lifted OUT of `turns` into a
  separate string** (every send-builder consumes system apart from the conversation — Codex `instructions`,
  Anthropic top-level `system`, OpenAI re-prepend), so the value feeds each builder with no second mapping.
  **Tool-result adjacency is inverted by buffering:** a run of `tool` messages is held and attached to the
  next user turn's `toolResults` (or flushed as a bare tool-result user turn), mirroring how
  `buildOpenAiChatMessages` emits tool messages BEFORE the user text.
- **Outbound** `BridgeStreamEvent = {text} | {tool_call}` → OpenAI `chat.completion.chunk` emitters
  (`textChunk`/`toolCallChunk`/`finalChunk`), `sseLine` wire form, `SSE_DONE`. **Tool calls are folded WHOLE**
  (one delta per call, full args, distinct `index`) because Wisp's stream reducers assemble calls before
  surfacing them — valid OpenAI shape, just not fragment-streamed. `finish_reason` = `tool_calls` if any call
  emitted else `stop`. Deterministic — `ChunkMeta {id,model,created}` is injected (no `Date.now()`/random here).
- **Models** `buildModelsList(ChatModelInfo[])` → `{object:'list', data:[{id,object:'model',created:0,owned_by:'wisp'}]}`.

**Trust-boundary guards (added after a 15-agent adversarial review of the diff before landing):** the review
confirmed 5 of 11 raw findings — all robustness, none a happy-path bug. `parseOpenAiChatRequest` parses an
UNTRUSTED external HTTP body, yet four spots dereferenced it blindly while the module's own doc comment claimed
it "never trusts the inbound body to be well-formed." Fixed (TDD: 5 new malformed-input tests + 1 parallel-
tool_calls coverage test): a missing/non-array `messages` → empty turns; non-iterable user `content`
(null/number/object) → empty-text turn; a `tool_call`/`tools` entry with no `function` → empty name/args;
unknown or partial content parts (a real OpenAI `input_audio` part, a url-less `image_url`) → skipped. All
**degrade, never throw** — so the #37 listener can map a parse-that-yields-nothing to a deliberate 400 rather
than catching a stray `TypeError`.
**Why guard now (not defer to #37):** the comment already advertised the robustness (comment-and-code are
peers — it must not lie), the fixes are ~5 lines in the file's existing degrade-don't-throw style, and
trust-boundary input validation is the one thing not worth deferring. `catalog.ts` was **NOT** touched —
every reused type was already exported (`NormalizedTurn`, `ToolSpec`, `AssembledToolCall`, `ChatModelInfo`);
the only locally-defined type is the inbound OpenAI request shape (no catalog equivalent — catalog models
only the *outbound* message).
**Unblocks #37** (listener + key-based skeleton): #35 + #36 were its two prerequisites.
**Reversibility:** easy/additive — the translator is two new files; drop them to remove. The guards are
load-bearing — don't strip them; the listener relies on a non-throwing parse.

## Related

- [[decisions]] — index
