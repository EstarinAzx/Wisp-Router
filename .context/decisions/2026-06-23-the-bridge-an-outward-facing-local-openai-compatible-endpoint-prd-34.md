---
type: decision
project: wisp
updated: 2026-06-23
tags: [context, decisions]
---

# The Bridge: an outward-facing local OpenAI-compatible endpoint (PRD #34, slices #35–#40)

**Decision:** Add the **Bridge** (new `CONTEXT.md` term) — a local OpenAI-compatible HTTP endpoint Wisp
exposes so tools **outside** VS Code (primarily a GitHub Copilot CLI session running inside VS Code) reach
the **Provider catalog** as one ordinary OpenAI backend, **including the Codex and Anthropic subscription
sign-in Providers**. Outward mirror of the inward **LM Chat Provider**. Planned, not built: PRD **#34** →
slices **#35** (env-var gate, HITL) · **#36** (pure protocol translator, TDD) · **#37** (listener +
key-based skeleton) · **#38** (panel toggle + secret) · **#39** (Codex) · **#40** (Anthropic).
- **Embedded in the extension host, NOT a standalone process.** The Codex/Anthropic OAuth tokens + refresh
  live in VS Code SecretStorage owned by `CodexAuth`/`AnthropicAuth`; an embedded listener reuses those live,
  auto-refreshed creds with zero token porting. Standalone is **rejected** — it can't read SecretStorage and
  would re-implement both sign-in flows. Tradeoff: the Bridge is alive only while VS Code + Wisp run; a
  background CLI session outliving VS Code loses it (accepted).
- **Model addressing:** the external tool names a **Provider id** as the OpenAI `model`; Wisp serves that
  Provider's selected model via `resolveModel`; `GET /v1/models` returns the same ids `buildChatModelInfos`
  produces. Optional `<provider-id>/<model-id>` exact form is a later escape hatch, not v1.
- **Security:** binds `127.0.0.1` only; fixed default port settable via a `wisp.*` setting; an auto-generated
  access secret (SecretStorage, shown in panel + command) is a required Bearer on every request. This is
  Wisp's **first inbound network listener** — residual risk is a local process that already holds the secret
  (standard local-proxy posture). **OFF by default**; toggled via command + panel switch.
- **Reuse:** all existing pure cores (`catalog.ts` resolvers + message builders + tool formatters),
  `codexClient`/`anthropicClient` (fetch+SSE), `codexAuth`/`anthropicAuth` (OAuth+refresh). **New code** = the
  HTTP server + the inbound/outbound OpenAI translation layer (the deep, tested module = the translator).
  Test the translator hard (Vitest, mirrors `catalog.test.ts`); listener + panel are glue → F5/manual.
- **ToS posture is IDENTICAL to existing Wisp** — subscription OAuth used outside the first-party client;
  credentials never leave Wisp; the provider only ever sees Wisp. No new ToS category. Non-ToS nuance:
  agent-loop traffic is heavier than chat → marginally higher rate-limit / abuse-detection odds.
**Why:** the user wants the Copilot CLI agent to run on a Claude.ai / ChatGPT subscription, which the CLI's
GitHub-backed picker can't reach (it ignores `vscode.lm`). The Bridge is the only path Wisp can deliver
unilaterally. The chat-session-provider alternative is blocked on a still-proposed (non-publishable) VS Code API.
**Out of scope:** image input over the Bridge, non-OpenAI wire formats, the chat-session-provider route,
Marketplace publish.
**Reversibility:** easy/additive (drop the two new modules + the toggle) — so **no ADR** (fails the
"hard to reverse" bar). The embedded-vs-standalone choice is the load-bearing part; don't re-open it without
re-reading the SecretStorage reason.

## Related

- [[decisions]] — index
