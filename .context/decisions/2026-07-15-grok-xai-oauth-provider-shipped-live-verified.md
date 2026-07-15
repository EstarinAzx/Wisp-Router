---
type: decision
project: wisp
date: 2026-07-15
tags: [context, decision, provider, oauth, grok, shipped]
---

# Grok (xAI OAuth) provider SHIPPED + live-verified — epic #91

**Decision.** The Grok provider (planned in [[2026-07-15-grok-xai-oauth-provider-planned-epic-91]]) is **built and live-verified.** Slices **#92–#97 merged to `main`** (PRs #99–#104), #98 release-prep in **PR #105** (awaiting the human tag). D1–D7 all implemented as planned; a Grok subscriber signs in once and reaches grok-build / composer / grok-4.5 in VS Code native chat + side panel + Inquire, the TUI, and both Bridge doors.

**Live verification (the risk that mattered).** Through `claude-wisp` (Bridge Anthropic door) both lanes stream real replies:
- **grok-4.5** — public `api.x.ai` lane, bearer only. ✓
- **grok-build** — subscription **proxy** lane with the `x-grok-*` headers. ✓

So the previously best-effort **`x-grok-client-identifier` / `-version` = `grok-cli` / `1.0.0`** (`catalog.ts`) are **CONFIRMED working**, not guesses. The D4 grok-4.5-lane caveat is functionally resolved (it works); only the *billing* question (SuperGrok vs metered) stays unverified — untestable from here.

**Reconciliations made during the build (vs the #91 spec):**
- **Refresh skew lives at the check.** `tokensToXaiCreds` stores the raw deadline; `shouldRefreshXaiToken` applies the 2-min skew (twin pattern) — the spec's "bake −2min into expiresAt AND check within skew" double-counts, so skew is applied once.
- **`rewriteXaiResponsesPayload`** (drop `prompt_cache_retention`, strip the `encrypted_content` include on proxy, fold `minimal`→`low`) targets a **raw external Responses passthrough**; our `buildCodexResponsesBody` emits a clean body, so it's defensive on our own path (real for the Bridge external path).
- **`effortOptionsFor` gained an explicit `isXaiProvider` arm** (Codex ladder, tops at xhigh); the per-model reasoning gate is `xaiReasoning` (grok-4.5+ reason, build/composer don't).
- **Bridge `xaiSignedIn?`/`xaiCreds?` are OPTIONAL** so #95 shipped without touching the faces; both faces (#96/#97) now provide them.
- **First `bridgeServer` server-level test** (`bridgeServer.test.ts`) — real listener + stubbed fetch, both doors + signed-out 401. Grok Inquire wired in VS Code (beyond #97's file list — the epic golden path names Inquire).

**Reversibility.** Shipped to main — reverts are per-PR. The **release itself is not yet done**: irreversible once `wisp-router@2.0.5` publishes (a burned npm version can't be republished), so the tag was deliberately left to a human.

## Related

- [[decisions]]
- [[2026-07-15-grok-xai-oauth-provider-planned-epic-91]]
- [[active-work]]
