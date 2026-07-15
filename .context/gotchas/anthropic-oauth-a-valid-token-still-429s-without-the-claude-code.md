---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Anthropic OAuth: a valid token still 429s without the Claude Code client fingerprint

The subscription Messages backend (`https://api.anthropic.com/v1/messages` via Claude.ai OAuth) **gates on a
server-validated client fingerprint**. A request with only `Authorization: Bearer <oauth>` +
`anthropic-version` + `anthropic-beta: oauth-2025-04-20` returns a **synthetic** 429:
`{"type":"rate_limit_error","message":"Error"}` — and the **tell that it's not a real limit is the ABSENCE of
`anthropic-ratelimit-*` headers and `retry-after`** (a genuine limit always includes them). Three signals are
mandatory (all in `src/anthropicClient.ts` / `catalog.ts`, openclaude-verified):
1. `anthropic-beta: claude-code-20250219,oauth-2025-04-20` (COMMA list — the `claude-code-*` beta is the
   primary gate; the oauth beta **alone is not enough**).
2. `User-Agent: claude-cli/0.19.0 (external, cli)` + `x-app: cli`. The inference UA token is **`claude-cli/`**,
   NOT `claude-code/` (that variant is MCP/WebFetch only).
3. The **first `system` block** = `x-anthropic-billing-header: cc_version=0.19.0.<fp>; cc_entrypoint=cli;`
   where `<fp> = sha256('59cf53e54c78' + msg[4]+msg[7]+msg[20] + version)` first **3 hex** chars, sampled from
   the **first user message** (missing index → `'0'`). The server recomputes it, so `anthropicAttribution` MUST
   run over the exact text sent, and `cc_version` must equal the UA version. `anthropicFingerprint` /
   `anthropicAttribution` are pure + TDD'd (`anthropic.test.ts`).
The **identity prose is NOT gated** (openclaude ships an "OpenClaude" identity and serves — Wisp keeps its own
system prompt), but a system block IS required (the attribution one). The `cch=00000` native-attestation token
(Bun's `Attestation.zig`) is **omitted** — unreproducible from Node and currently unenforced; the request
serves without it. If Anthropic enforces it later, the Anthropic path breaks (Bun forks survive). To debug a
future 429, dump the response headers first — no rate-limit headers ⇒ recognition/fingerprint, not a real
limit. See [[decisions]] 2026-06-23.

## Related

- [[gotchas]] — index
