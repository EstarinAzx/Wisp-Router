---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# Codex Provider: supersede the no-OAuth ADR (subscription-backed)

**Decision:** Add a **Codex Provider** — a new Provider *kind* reached by ChatGPT-account
**OAuth sign-in**, running OpenAI's Codex models on the user's subscription via the **Responses
API** (`/backend-api/codex/responses`, SSE), on **both** surfaces (Inquire + LM Chat Provider).
This **supersedes the 2026-06-15 "no OAuth subsystem / OpenAI-chat-only" decision** for the Codex
case. Modeled as a discriminated **`kind: 'openai-chat' | 'codex'`** catalog row so selection /
panel / model-memory / chat-enumeration are reused; only **auth**, **request transport**, and the
**"usable"** test branch on kind. Pure logic (Responses reducer, request builder, JWT parse +
refresh, `~/.codex/auth.json` parser, codex-usable branch) in `catalog.ts` (TDD); impure OAuth/IO +
Responses shim in new `codexAuth.ts` / `codexClient.ts`. Tokens in **SecretStorage `wisp.codexAuth`**
(+ `~/.codex/auth.json` import, refresh at `exp − 60s`). OAuth uses the **published Codex-CLI app**
(`client_id app_EMoamEEZ73f0Ck…`, loopback `:1455`, PKCE S256, originator `codex_cli_rs`). Full
tool-calling parity, built **text-first**; `toolCalling` advertised true only once the Responses
tool-mapper exists. **No consent gate** (matches the Codex CLI). Planned as PRD #11 / slices #13–#15.

**Why:** the user wants to spend a ChatGPT subscription in Wisp, which only the subscription-backed
path delivers — and that path is *not* Bearer-API-key + chat-completions, so the no-OAuth/one-client
constraint had to give. Critically this is **not** the Copilot/Cursor failure mode: those were
dropped for reverse-engineered impersonation of undocumented endpoints (ban risk); Codex uses
OpenAI's **own published** Codex-CLI OAuth flow + endpoint, so the ToS posture is materially
different. Copilot/Cursor stay dropped. The discriminated-row design keeps the "Active Provider is
the single source of truth" model intact rather than spawning a parallel subsystem.

**Reversibility:** the OAuth subsystem + Responses shim are additive (easy to drop the row). But the
*supersession itself* is load-bearing — don't re-close the "no OAuth" door without re-reading this;
the project now intentionally has two Provider kinds. Reference for the flow: `XETH--7` (mapped).

## Related

- [[decisions]] — index
