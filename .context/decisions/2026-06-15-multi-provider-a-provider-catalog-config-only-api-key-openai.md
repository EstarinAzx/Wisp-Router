---
type: decision
project: wisp
updated: 2026-06-15
tags: [context, decisions]
---

# Multi-provider: a Provider catalog (config-only, API-key, OpenAI-compatible)

**Decision:** Add multiple **Providers** as a curated **Provider catalog** plus a **Custom**
escape hatch. v1 catalog (9 built-in): **OpenCode Zen** (default) · OpenAI · Groq · Mistral ·
OpenRouter · Ollama (local) · **Ollama Cloud** · **KiloCode** · **Cline** — every one
OpenAI-chat-compatible + API-key (Bearer), reached through the **existing `openai` SDK** by
swapping base URL + key + model. **No new client code, no OAuth subsystem.**

**Architecture — the Active Provider is the source of truth** (chosen over a "populate the free
settings then forget" model): state is an **Active Provider id** (`wisp.provider`) + a
**per-Provider record** `{ key, model }`. Keys live in namespaced SecretStorage slots
(`wisp.apiKey.<id>`) with a per-Provider env-var fallback from each catalog row (`OPENCODE_API_KEY`,
`OPENAI_API_KEY`, `OLLAMA_API_KEY`, …). Per-Provider **model memory** lives in extension
`globalState` (a `{ providerId: model }` map); `wisp.model` mirrors the Active Provider's current
model. Built-in **base URLs are hardcoded in the catalog**; **Custom** is the only Provider exposing
a user-supplied base URL (the repurposed machine-scoped `wisp.baseUrl`). There is **no model-id
transform** — each row ships its `defaultModel` in the Provider's *native* format (avoids re-adding
the `opencode/` prefix that 401'd Zen; see the "Bare model ids" entry).
_Why source-of-truth:_ per-Provider key memory already forces a per-Provider record; a single global
model is actively wrong across Providers (Zen `minimax-m3` vs OpenAI `gpt-4o`) → switching with a
stale id 401/404s; and it removes provider/baseUrl drift.

**Security — `wisp.provider` is `"scope": "machine"`** (extends the 2026-06-10 `baseUrl` machine-scope
ADR). _Why:_ selecting a Provider selects where the **bearer key is sent**, so a workspace-overridable
selector is a key-redirect/exfiltration vector. Built-in URLs in code (not settings) mean a hostile
workspace cannot tamper with where Zen/OpenAI/etc. point; Custom's URL is machine-scoped only.
**Reversibility:** easy to drop the scope line, but security-relevant — don't revert without reason.

**Migration — silent one-time** `wisp.apiKey` → `wisp.apiKey.opencode-zen` (+ `wisp.model` into Zen's
record), then delete the old slot. _Why a shim here when the rebrand chose none:_ the rebrand was a
namespace rename where old→new was a blind guess across an unknown future; here Zen is the **only**
Provider today, so the existing key is **provably** the Zen key — the mapping is unambiguous, so a
shim is safe, not a guess. Avoids a second key re-entry in two consecutive releases.

**Dropped: GitHub Copilot and Cursor** (researched + adversarially verified, 2026-06-15).
**Copilot** — the only OpenAI-compatible path to its chat backend is reverse-engineered client
impersonation against undocumented endpoints → **high, irreversible account-ban risk**; the sanctioned
Copilot SDK is an *agent runtime*, not raw `/chat/completions`, so it can't drive inline completion.
**Cursor** — even its sanctioned API is **shape-incompatible** (agent orchestration, no
`/chat/completions`); "auth only" = piggybacking the local Cursor session token to hit the private
`api2.cursor.sh` → ToS violation + live ban precedent. OAuth would not fix *why* either fails, so **no
"OAuth providers" feature is needed** for this set.

**Cline ToS (medium risk):** Cline's terms §2.2 bar "competing products" use → ship **user-supplied-key
only** (never an embedded/proxied shared key) + a one-line "you are responsible for your own ToS
compliance" note. Built-in `defaultModel`s + KiloCode's model-id namespace are **best-effort presets**,
verified against each `GET /models` at build; **Custom** is the always-works fallback.

**Reversibility:** the catalog and per-Provider record are additive and easy to trim; the machine-scope
and the dropped-provider calls are the load-bearing, don't-casually-revert parts.

## Related

- [[decisions]] — index
