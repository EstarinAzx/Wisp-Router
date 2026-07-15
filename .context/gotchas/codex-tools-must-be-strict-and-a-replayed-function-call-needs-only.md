---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex tools must be STRICT, and a replayed `function_call` needs only `call_id` (not `id`)

Two facts for the #15 agent round-trip. **(1) Strict schemas:** `toCodexResponsesTools` runs every tool's
`inputSchema` through `enforceStrictResponsesSchema` — every object gets `additionalProperties:false` and
**all** its keys listed in `required` (recursively, incl. array `items` and `anyOf/oneOf/allOf`), and the
tool carries `strict:true`. Codex strict mode **rejects** an open or partially-required object. The tool is
**flat** (`{type,name,description,parameters,strict}`), NOT chat-completions' nested `function` object —
don't reuse `toOpenAiTools` for Codex. **(2) call_id-only round-trip:** the replayed `function_call` input
item carries **`call_id`, name, arguments** — **no `id`**. With `store:false` the request is stateless, so
there is no prior server item for an `id` to reference; the F5 round-trip succeeded sending call_id-only.
XETH-7 *also* sends a derived `id` (`fc_…`) — unnecessary here. If a future multi-turn flow 400s on the
round-trip, add `id` to the `function_call` item in `buildCodexResponsesBody` (one line). The reducer
(`reduceResponsesToolCalls`) keys streamed events by the **item id** but surfaces **call_id** as the
round-trip id — that is what `function_call_output.call_id` must match. See [[decisions]] 2026-06-19.

## Related

- [[gotchas]] — index
