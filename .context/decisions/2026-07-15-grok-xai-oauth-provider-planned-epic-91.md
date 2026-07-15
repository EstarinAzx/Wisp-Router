---
type: decision
project: wisp
date: 2026-07-15
tags: [context, decision, provider, oauth, grok]
---

# Grok (xAI OAuth) provider planned — epic #91, target 2.0.5

**Decision.** Add a fourth OAuth Provider kind, `xai-oauth` (Grok / xAI), mirroring the **Codex** path (OAuth + Responses API + subscription proxy + `x-grok-*` headers). A Grok subscriber signs in once and reaches Grok Build (+ Composer + Grok 4.5) through both faces.

**Context.** Wisp's OAuth differentiators are subscription sign-ins native BYOK can't reach (ChatGPT→Codex, Claude.ai→Anthropic). xAI ships the same species of login, so Grok is the natural fourth. Reference studied: `github.com/BlockedPath/pi-xai-oauth` (built for the pi agent — extracted only the xAI OAuth flow + payload rules).

**Locked — D1–D7:**
- **D1** — `id:'xai'`, `label:'Grok'`, `kind:'xai-oauth'`. **NOT** the existing Groq row (Llama, API-key) — Grok ≠ Groq, one letter apart.
- **D2** — PKCE loopback OAuth + refresh tokens. Public client `b1a00492-073a-47ea-816f-4c329264a828`, scope `openid profile email offline_access grok-cli:access api:access`.
- **D3** — Responses API + `x-grok-*` headers; proxy `cli-chat-proxy.grok.com/v1` for sub models, `api.x.ai/v1` for 4.5.
- **D4** — Models: `grok-build` **(default)**, `grok-composer-2.5-fast`, `grok-4.5`.
- **D5** — Both faces (VS Code + TUI), parity with Codex/Anthropic.
- **D6** — Import existing `~/.grok/auth.json` (parity with Codex's `~/.codex` import).
- **D7** — Endpoints discovered once via `auth.x.ai/.well-known/openid-configuration`, cached in creds.

**Open caveat.** `grok-4.5` rides the public `api.x.ai` lane (not the sub proxy); the OAuth token reaches it via the `api:access` scope, but whether xAI bills it under SuperGrok or as metered API usage is **unverified**. `grok-build`/`composer` are squarely inside the subscription.

**Sliced.** Epic **#91** → **#92** catalog → **#93** XaiAuth / **#94** client → **#95** Bridge → **#96** TUI / **#97** VS Code → **#98** release. ~60+ touch points mapped (catalog kind + provider checks + model caps, `bridgeServer` dispatch, extension deps, chatProvider send, TUI slash handlers, tests). Chain is **self-promoting**: closing a slice labels its now-unblocked dependents `ready-for-agent`, so `/loop /preset ticket-loop` (self-paced) walks the whole tree; each leg reads its blockers' breadcrumbs + committed code first. Public xAI constants + model caps live in the **epic #91 body** — source of truth, don't re-derive.
