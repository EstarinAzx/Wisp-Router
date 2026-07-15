---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex `/responses` requires a non-empty `instructions` — default it for native chat

The backend **400s "Instructions are required"** if `instructions` is absent or empty. Inquire never hit this
(`buildEditPrompt` always emits a system message), but the native-chat path has **no System role** (VS Code's
chat API only has User/Assistant), so it sent none → 400. `buildCodexResponsesBody` now **defaults**
`"You are a helpful coding assistant."` when no system turn is present; `CodexResponsesBody.instructions` is
required, not optional. Don't make it omittable again.

## Related

- [[gotchas]] — index
