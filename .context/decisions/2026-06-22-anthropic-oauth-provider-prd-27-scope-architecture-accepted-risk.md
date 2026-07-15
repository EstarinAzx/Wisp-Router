---
type: decision
project: wisp
updated: 2026-06-22
tags: [context, decisions]
---

# Anthropic OAuth Provider (PRD #27): scope, architecture, accepted risk

**Decision:** Add a third **Provider kind**, the **Anthropic Provider** (`kind:'anthropic-oauth'`) — a
built-in Provider credentialed by **signing in** to a Claude.ai (Pro/Max) subscription over OAuth, running
Claude on the **Anthropic Messages API** across Inquire + the native LM Chat picker. **Scope = Anthropic
only; xAI deferred** to a future PRD (user has no xAI subscription). Mirror the existing **Codex Provider**
pattern (`codexAuth.ts`/`codexClient.ts`) — new `AnthropicAuth` (PKCE/loopback/SecretStorage slot
`wisp.anthropicAuth`/refresh, 5-min skew, `{}` tombstone) + a bespoke `anthropicClient` Messages adapter,
plus `isCodexProvider`-style branches in `catalog.ts`/`chatProvider.ts`/`extension.ts`/panel/`package.json`.
Scoped as PRD #27 → slices **#28** (tracer, unblocked, HITL-verify) → **#29** (chat streaming) → **#30**
(tool-calling parity). Full design + endpoints/scopes/headers in [[oauth-recon]].

**Three load-bearing sub-decisions:**
1. **Defer the dispatch-registry refactor + shared-OAuth-scaffolding extraction.** With only two OAuth kinds
   (Codex + Anthropic), generalizing the ~6 `isCodexProvider` branch sites is YAGNI. Mirror Codex now;
   refactor when xAI actually lands and a 3rd kind pays for it.
2. **Anthropic is NOT OpenAI-compatible → a bespoke Messages-API adapter is required** (the direct analogue
   of the Responses adapter the Codex Provider needed). Budget it as "a second non-OpenAI wire format," not
   "another OAuth row." The `create_api_key` Console path is rejected — it adds a durable-key concern without
   removing the wire-format problem.
3. **No system-prompt spoof is needed.** Verified: openclaude ships a non-"Claude Code" identity
   (`PRODUCT_DISPLAY_NAME='OpenClaude'`) and Anthropic OAuth inference still serves. Recognition is the OAuth
   token + client_id `9d1c250a-…` + `claude-code/<ver>` UA + `anthropic-beta: oauth-2025-04-20` + billing
   header. Wisp keeps its own system prompt.

**Why:** the user pays for Claude.ai and wants that subscription inside Wisp, exactly as the Codex Provider
spends a ChatGPT subscription. This is the intended "subscription-as-a-model" moat the v1.x README now leads
with. The discriminated-kind design keeps "Active Provider is the single source of truth" intact.

**Accepted risk (explicit):** reusing Claude Code's client_id to drive a user's subscription from a
third-party extension is plausibly out-of-policy for Anthropic; residual risk is platform-level (client_id
revocation / beta churn) and account-level — **accepted by design**. Separately, a dormant
`NATIVE_CLIENT_ATTESTATION` (`cch` token computed by Bun's `Attestation.zig`, server-verifiable "real Claude
Code client") is a kill-switch Wisp on Node **cannot** reproduce; currently unenforced. If Anthropic
enforces it, the Anthropic path breaks while Bun forks (openclaude) survive — a **known ceiling, not a
blocker**, and xAI would be unaffected.

**Reversibility:** the Anthropic modules are additive (drop the row + two files). But the
Messages-adapter-required, no-sysprompt-spoof, and accepted-risk facts are load-bearing — don't "simplify"
Anthropic into an OpenAI-compatible row, and don't re-open the ToS go/no-go without re-reading this. The
deferred registry refactor stays open for the xAI PRD.

## Related

- [[decisions]] — index
