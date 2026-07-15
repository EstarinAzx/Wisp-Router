---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Bridge #37 built: the HTTP listener + keyed walking skeleton (live-verified)

**Decision:** Shipped slice #37 — `src/bridgeServer.ts` (impure glue over the pure `bridge.ts`) + wiring in
`src/extension.ts` + a `wisp.bridge.port` setting (machine-scoped, default `41184`) + a `wisp.bridgeToggle`
command. The listener binds `127.0.0.1`, enforces the access-secret Bearer on **every** request
(constant-time `crypto.timingSafeEqual` with a length guard), routes `POST /v1/chat/completions` and
`GET /v1/models`, and is **glue → F5-verified, not unit-tested** (per the PRD; the genuinely-new logic is the
already-tested `bridge.ts`). Built on node's `http` stdlib — **no web-framework dependency**. The seam mirrors
`chatProvider.ts`'s `ChatProviderDeps` (providers + model-map/baseUrl getters + async key/client resolvers);
`extension.ts` owns secrets, the listener reads none. Send path = the existing OpenAI SDK
(`client.chat.completions.create`, `stream:true`), with **system re-prepended** (the translator keeps it out
of `turns`), then rendered back through `bridge.ts`'s SSE emitters; tool-call fragments are collected and
`assembleToolCalls`-folded exactly as the LM Chat Provider path does.

**Two scoping choices worth recording:**
- **A non-streaming path was added beyond the pure translator.** `bridge.ts` is deliberately streaming-only
  (SSE emitters). When a client sends `stream:false`, the listener drains the same upstream stream and answers
  one `chat.completion` object (the aggregate envelope is glue, ~12 lines, in `bridgeServer.ts` — `bridge.ts`
  stays pure-streaming). Rationale: it closes a real foot-gun (a client or plain curl sending `stream:false`
  would otherwise get a broken SSE reply), at trivial cost. The PRD's acceptance is SSE-only; this is a
  correctness superset, not a scope expansion of the pure module.
- **Keyed Providers only; the secret is a temp constant; a palette command drives the toggle.** Codex/Anthropic
  deliberately return `400 not yet reachable` (their send-paths are #39/#40). The access secret is a constant
  (`BRIDGE_ACCESS_SECRET` in `extension.ts`) and `wisp.bridgeToggle` shows the address+secret in a toast — both
  are #37 test scaffolding; the auto-generated SecretStorage secret + panel switch + copy button are **#38**.
  The panel switch will call the same `bridge.start()/stop()` — no fork.

**Untrusted-body posture at the listener (the trust boundary):** the body is `JSON.parse`'d (parse failure →
**400**), then `parseOpenAiChatRequest` (which degrades, never throws) — a parse that yields no turns is mapped
to a deliberate **400**, not a caught `TypeError`. Body size is capped (25MB) so a malformed/huge body can't
exhaust host memory. Client disconnect aborts the upstream call via `AbortController`.

**Verification:** `tsc` clean; **234 tests still green**; a 16-check standalone smoke (fake OpenAI client, real
HTTP) covered auth/routing/SSE-shape/non-stream/400/404; and a **live F5 round-trip** streamed a real reply
through `opencode-go` (text deltas → `finish_reason:stop` → `[DONE]`, model echoed as the provider id).
**Unblocks #38** (panel UI + generated secret + env-var injection), then #39/#40.
**Reversibility:** easy/additive — one new file + a handful of wiring lines; drop them to remove. No ADR
(consistent with the Bridge PRD's "additive, easy to drop" call).

## Related

- [[decisions]] — index
