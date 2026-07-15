---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# The chat/Ctrl+I picker hard-filters on `toolCalling` — a text-only model is INVISIBLE

VS Code shows ONLY tool-capable models in the chat / Ctrl+I / agent picker. A model advertising
`toolCalling: false` is absent **everywhere** the picker appears — Ask mode included; it shows up **only** in
the Manage Models list (which lists every registered model, regardless of capability). Docs: "if the model
doesn't support tool calling, it won't be shown in the model picker" (confirmed by #14 F5). Consequence:
**Codex advertises `toolCalling: true` so it is selectable**, and as of #15 the flag is **honest** (tools are
forwarded + round-tripped). `buildChatModelInfos` sets `toolCalling: true` for every row. Don't set it false
for a model you still want selectable. (`imageInput`/vision is NOT filtered on — only `toolCalling`.)

## Related

- [[gotchas]] — index
