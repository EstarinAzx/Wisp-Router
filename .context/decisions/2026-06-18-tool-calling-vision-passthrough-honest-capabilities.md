---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# Tool calling + vision passthrough (honest capabilities)

**Decision:** Declare a capability ONLY with its real implementation. **Tool calling**: advertise
`toolCalling: true` AND forward `options.tools` → reassemble streamed `delta.tool_calls` →
`LanguageModelToolCallPart` (pure `toOpenAiTools`/`buildOpenAiChatMessages`/`assembleToolCalls` in
`catalog.ts`, TDD'd). **Vision**: forward image `LanguageModelDataPart`s as OpenAI `image_url` data
URIs, multimodal user content built by `buildOpenAiChatMessages`.
**Why:** VS Code hides models without `toolCalling` from the agent/edit/Ctrl+I pickers (only Ask mode /
"Other Models" showed them) — so the capability is required for selection, and declaring it without the
passthrough would let agent mode pick a model that silently can't call tools.
**Reversibility:** easy; out of scope stays image *output*, prompt-tsx, managementCommand.

## Related

- [[decisions]] — index
