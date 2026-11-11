---
type: decision
project: wisp
date: 2026-11-11
tags: [context, vscode, codex, antigravity]
---

# VS Code context and replay boundaries

Implementation choice within the user's delegated VS Code fix scope: retain Codex account default and
maximum separately, and use the maximum only to bound an explicit exact-model Wisp override. This
refines, rather than reverses, [[2026-09-06-codex-discovery-is-account-metadata-ultra-is-orchestration]].
Public API capacity and native Codex configuration do not silently change Wisp's subscription budget.

Native Antigravity chat reuses the existing text/tool stream. Argon stays on qualified Bridge Responses
because arbitrary opaque data-part survival through Copilot persistence/compaction is not established.
Image-output and unqualified IDs are also refused. Expanding this boundary requires protocol evidence,
not just making a picker row visible. The tradeoff is a conservative native model set.

[Behavior, rationale and checks](../../docs/vscode-provider-parity.md) is the durable implementation
reference. The calls are reversible through a scoped follow-up with the missing protocol evidence.

## Related

- [[decisions]]
- [[active-work]]
- [[flows]]
