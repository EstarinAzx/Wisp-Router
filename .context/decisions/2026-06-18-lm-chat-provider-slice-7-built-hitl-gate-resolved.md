---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# LM Chat Provider (slice #7) built; HITL gate resolved

**Decision:** Built the deferred bonus — Wisp registers a **Language Model Chat Provider** (vendor
`wisp`) so its keyed Providers appear as models in VS Code's **native** chat / Ctrl+I picker, streaming
through Wisp's own OpenAI-compatible client. New `src/chatProvider.ts` (vscode/openai glue) +
pure `buildChatModelInfos` in `catalog.ts` (one row per *usable* Provider: key + resolvable model +
Custom's URL). `extension.ts` generalized to per-Provider key/client resolvers; Inquire untouched.
**HITL gate resolved (was the blocker):** `registerLanguageModelChatProvider` is **finalized in VS
Code 1.104** (Aug 2025), NOT proposed API — publishable. The "BYOK needs Copilot Business/Enterprise"
worry is Copilot's *own* BYOK (Manage Models), a different feature; our extension API is open. Cost:
`engines.vscode` + `@types/vscode` bumped to `^1.104`.
**Why now:** the user asked for it after the core slices landed; gating verified before any code.
**Reversibility:** additive surface — easy to drop; Inquire does not depend on it.

## Related

- [[decisions]] — index
