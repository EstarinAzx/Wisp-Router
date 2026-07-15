---
type: decision
project: wisp
updated: 2026-06-19
tags: [context, decisions]
---

# Codex tracer built (slice #13); live round-trip resolved the request contract

**Decision:** Shipped the Codex Provider tracer per the 2026-06-18 ADR. New pure cores in `catalog.ts`
(TDD, `npm test` 111/111): `Provider.kind`, `isCodexProvider`, `isCodexSignedIn`, `buildCodexResponsesBody`,
`reduceResponsesTextEvents`/`extractResponsesText`, the JWT pair `decodeJwtPayload`/`parseChatgptAccountId`
+ `shouldRefreshCodexToken` (60s skew), `parseCodexAuthJson`, `codexReasoning`, `CODEX_MODELS`. New impure
`codexAuth.ts` (PKCE S256, loopback `:1455` + ephemeral fallback, token exchange, SecretStorage
`wisp.codexAuth`, `~/.codex/auth.json` import, refresh) + `codexClient.ts` (raw `/responses` fetch,
SSE→text). `extension.ts` branches Inquire on `kind` (codex → Responses, else OpenAI SDK), adds
`wisp.codexSignIn`/`wisp.codexSignOut`, and treats codex as usable-when-signed-in (no key field). Panel
swaps the key field for sign-in/out + a curated Codex model dropdown. **F5 live round-trip PASSED.**

**Live-resolved request contract (the tracer's whole point — these were unknowns until F5):**
- **Bearer = the OAuth `access_token`** against `https://chatgpt.com/backend-api/codex/responses` (the
  *subscription* path), NOT the id_token→`sk-` exchanged apiKey (that targets `api.openai.com`, a different
  endpoint + billing). Headers: `chatgpt-account-id` (hard-required — error early if absent), `originator:
  codex_cli_rs`, `OpenAI-Beta: responses=experimental`, `session_id`.
- **Reasoning models REQUIRE `reasoning: { effort, summary:'auto' }`** on the body or they 400; non-reasoning
  models reject it. `codexReasoning(model)` sends `medium` for gpt-5/o, omits for gpt-4.x/spark.
- **`gpt-5-codex` is a dead id** (400). Default is now **`gpt-5.3-codex`**; the dropdown offers the current
  curated lineup (no `/models` route exists on the Codex backend).
**Why these aren't guesses:** confirmed by the F5 round-trip + cross-checked against the working `XETH--7`
reference (`codexShim.ts` `performCodexRequest`, `providerConfig.ts` reasoning map).

**Sign-out tombstone (non-obvious):** `signOut` writes an **empty `{}` tombstone** to `wisp.codexAuth`
rather than deleting the slot. Deleting let `current()`/`isSignedIn()` **re-import `~/.codex/auth.json`** on
the next render, so a Codex-CLI user could never sign out (it snapped back to signed-in). The tombstone is a
present-but-bearer-less blob → reads as signed-out AND suppresses the import until an explicit sign-in.

**Native chat picker deferred to #14:** Codex is intentionally **absent** from VS Code's Language Models /
Ctrl+I picker in #13. It's keyless (hidden by `buildChatModelInfos`), and that surface streams through the
OpenAI **chat-completions** client which 404s against `/responses`. Making it visible *and working* there is
slice #14 (advertise-when-signed-in + a Responses **streaming** branch) — visibility without the stream is a
dead pick, so the two ship together.

**Reversibility:** the Codex modules are additive (drop the row + the two files). But the access_token-bearer,
reasoning-required, dead-`gpt-5-codex`, and sign-out-tombstone facts are load-bearing — they're the live
contract, not preferences; don't "simplify" them away. See [[gotchas]].

## Related

- [[decisions]] — index
