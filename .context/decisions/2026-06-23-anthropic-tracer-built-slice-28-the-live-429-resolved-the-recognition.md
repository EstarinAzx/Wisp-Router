---
type: decision
project: wisp
updated: 2026-06-23
tags: [context, decisions]
---

# Anthropic tracer built (slice #28); the live 429 resolved the recognition contract

**Decision:** Shipped the Anthropic Provider tracer per the 2026-06-22 ADR. New pure cores in `catalog.ts`
(TDD, `npm test` **159/159**): `Provider.kind += 'anthropic-oauth'`, `isAnthropicProvider`,
`isAnthropicSignedIn`, `tokensToAnthropicCreds` (expires_in → absolute `expiresAt`), `shouldRefreshAnthropicToken`
(5-min skew), `parseAnthropicCreds` (tombstone/corrupt → undefined), `ANTHROPIC_MODELS`, the shared PKCE
generators (`base64url`/`codeVerifier`/`codeChallenge`/`oauthState`, lifted into `catalog.ts` so they're
unit-testable — Codex keeps its private copies until the deferred extraction), and the **client attestation**
pair `anthropicFingerprint`/`anthropicAttribution`. New impure `anthropicAuth.ts` (PKCE/loopback/SecretStorage
`wisp.anthropicAuth`/JSON token exchange/scope-omitting refresh/`{}` tombstone) + `anthropicClient.ts`
(non-streaming `/v1/messages`, system-as-block-array, text extract). `extension.ts` branches Inquire on
`isAnthropicProvider`; panel generalizes the Codex sign-in block to both OAuth kinds. **F5: sign-in + one
Inquire edit PASSED.**

**The load-bearing live finding — the subscription Messages backend gates on a SERVER-VALIDATED client
fingerprint; missing it returns a *synthetic* 429.** Sign-in worked first try, but the first inference 429'd
with `{"type":"rate_limit_error","message":"Error"}` and — the tell — **no `anthropic-ratelimit-*` headers and
no `retry-after`** (a real limit always carries them). Three recognition signals were required, none of which
a bare OAuth request sent (extracted from openclaude's actual Messages code, `D:/.claude/claude projects/openclaude`):
1. **`anthropic-beta: claude-code-20250219,oauth-2025-04-20`** — a COMMA-joined list. `claude-code-20250219`
   is the primary "this is Claude Code" gate; **`oauth-2025-04-20` alone is NOT enough**.
2. **User-Agent `claude-cli/0.19.0 (external, cli)`** + `x-app: cli`. NB the inference UA token is
   **`claude-cli/`**, not `claude-code/` (that one is MCP/WebFetch only) — this **corrects** the 2026-06-22
   ADR sub-decision 3, which named `claude-code/<ver>`.
3. **A first `system` block** `x-anthropic-billing-header: cc_version=0.19.0.<fp>; cc_entrypoint=cli;` whose
   `<fp>` is a **server-recomputed** fingerprint: `sha256('59cf53e54c78' + msg[4]+msg[7]+msg[20] + version)`,
   first **3 hex** chars, sampled from the **first user message** (missing index → `'0'`). It MUST be derived
   from the exact text sent. `cc_version` must match the UA version. **This was the final unlock.**
This **sharpens** the recon's abstracted "recognition = token + client_id + UA + oauth beta + billing header"
([[oauth-recon]] §5e): the billing header is a *system block carrying a validated fingerprint*, not an HTTP
header, and the oauth beta is one of several. The 2026-06-22 ADR's "no system-prompt **identity** spoof"
stands (openclaude ships an "OpenClaude" identity and still serves — Wisp keeps its own Inquire prompt); but
"no system prompt at all" was never true — the attribution block is mandatory.

**Why these aren't guesses:** confirmed by the F5 round-trip (each header set retested live) + the exact bytes
read from openclaude's `constants/system.ts` (`getAttributionHeader`) / `utils/fingerprint.ts`
(`computeFingerprint`, salt `59cf53e54c78`, indices 4/7/20) / `services/api/claude.ts` (system-block assembly).
The diagnostic that found it: dump the full 429 response headers — their absence proved synthetic-not-real.

**`cch` attestation still unreproducible/unenforced:** the `cch=00000` token Bun's `Attestation.zig` overwrites
is omitted (no native attestation build) and the request serves fine — confirming the dormant kill-switch is
not yet enforced.

**Reversibility:** the modules are additive (drop the row + two files). But the fingerprint recipe (salt,
indices 4/7/20, 3-hex slice, version-must-match-UA) and the `claude-code-20250219` beta are the live contract,
not preferences — don't "simplify" them away or the backend 429s again. Reference: openclaude
`constants/system.ts`, `utils/fingerprint.ts`, `services/api/claude.ts`. See [[gotchas]].

## Related

- [[decisions]] — index
