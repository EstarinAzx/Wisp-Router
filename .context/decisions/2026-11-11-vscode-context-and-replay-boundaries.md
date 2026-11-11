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

Native Antigravity chat reuses the existing text/tool stream for ordinary supported models. Argon was
initially restricted to Bridge Responses pending evidence. The user's follow-up explicitly requested
native Argon support; pinned VS Code1.145.3/Copilot source and isolated host tests established the
`stateful_marker` carrier. Argon low/medium/high now use encrypted original model parts, authenticated
to account, endpoint, tier and conversation, with exact tool-result identity validation.

Classic Copilot replays its per-assistant packets from history. The newer Local mode sends only a
previous-response marker plus incremental input; a32-checkpoint/16MiB serialized-history memory cache
restores that path. This avoids new disk persistence, at the cost of a new Local chat after reload or
eviction. Copilot summary/pruning can also remove required state, which fails clearly instead of
inventing signatures. Image input/output for Argon and other unqualified IDs remain refused.

[Behavior, rationale and checks](../../docs/vscode-provider-parity.md) is the durable implementation
reference. These limits are reversible through a scoped follow-up with the missing protocol evidence;
synthetic/source qualification does not establish live service entitlement or seamless compaction.

## Related

- [[decisions]]
- [[active-work]]
- [[flows]]
