---
type: decision
project: wisp
updated: 2026-07-13
tags: [context, decisions]
---

# The Bridge door forwards Codex tools `strict:false` (external toolsets can't be strict-coerced)

**Decision:** On the Anthropic door's Codex path, `toCodexResponsesTools(tools, false)` sends tools **non-strict**
— the schema rides through verbatim, no strict closure. `toCodexResponsesTools` gained a `strict` flag (default
true, so the native VS Code agent path is unchanged). Tried first: extend `enforceStrictResponsesSchema` to strip
Codex-rejected keywords (`propertyNames`, `patternProperties`, …) — that strip stays as strict-path hardening but
did NOT solve it (Codex then rejected the coerced `required`/`properties` mismatch on `AskUserQuestion`'s dynamic
`answers` map).
**Why:** Codex strict mode demands a fixed closed shape (every object `additionalProperties:false`, `required` ==
all keys, no open/dynamic maps). Claude Code's built-in tools (esp. `AskUserQuestion`, a question→answer map) can't
be expressed that way — coercing them is whack-a-mole, one strict violation after another. A proxy doesn't own the
external client's schemas, so it must forward them loosely, exactly as the OpenAI-chat and Anthropic tool builders
already do. Verified live: Codex OAuth completes a tool round-trip through the door with strict:false.
**Reversibility:** easy — one flag; native path untouched. Note the OpenAI door's Codex path (`handleCodexChat`)
still sends strict — same latent limit for Copilot's tools, out of #46 scope.

## Related

- [[decisions]] — index
