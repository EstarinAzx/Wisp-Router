---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Bridge #39 built: Codex over the Bridge (pure reuse of the LM Chat Provider's Responses path)

**Decision:** Made the `kind:'codex'` Provider reachable on `POST /v1/chat/completions` — it was returning
`400 not yet reachable`. **No new auth or transport**: the Bridge's `handleCodexChat` (`src/bridgeServer.ts`)
drives the **same cores the LM Chat Provider already uses** — `codexStream` (Responses-API SSE) with
`codexAuth.current()` creds (sign-in + refresh), `standardEffortToCodex(effort)`, and
`toCodexResponsesTools`. The only genuinely-new wiring is mapping the Bridge's normalized turns into the
Codex request and the Codex stream events back through the translator. Two files:
- `bridgeServer.ts`: `BridgeDeps` gained `codexCreds` / `codexSignedIn` / `effort`. The `handleChat` guard
  split — `codex` → `handleCodexChat`, anthropic still `400` (#40). `/v1/models` now advertises `codex`
  when **signed in** (`isCodexProvider(p) ? await deps.codexSignedIn() : …`), anthropic still forced false.
  `handleCodexChat` renders text + assembled tool calls back through bridge.ts's existing
  `textChunk`/`toolCallChunk`/`finalChunk` (or one `chat.completion` on `stream:false`) — **identical wire
  shape to the keyed path**, so the translator is reused, not duplicated.
- `extension.ts`: passed `codexAuth.isSignedIn` / `codexAuth.current` / `activeEffort` into
  `createBridgeServer` (the exact getters `registerWispChatProvider` already receives).

**Two load-bearing details:**
1. **`parsed.system` is re-attached as a leading `role:'system'` message**, not passed separately — Codex
   has no system *turn*; `buildCodexResponsesBody` folds any `role:'system'` message into `instructions`
   (and defaults one when absent, so the backend's "Instructions are required" 400 can't fire). bridge.ts
   deliberately keeps `system` out of `turns`, so the send-path must re-prepend it — mirrors the keyed
   path's `[{role:'system'}, ...base]`.
2. **Signed-out fails clean, never crashes** (acceptance #4): no creds → **401** before any upstream call;
   a stream throw (refresh fail / mid-stream) → **502** (or just `end()` if the SSE head is already out).

**Surgical call — keyed path untouched.** `handleCodexChat` duplicates ~12 lines of SSE-writing rather than
refactoring the verified keyed path into a shared renderer. Rationale: zero regression risk to the
F5-verified #37/#38 slice; the shared-renderer refactor (bridge.ts's `BridgeStreamEvent` was built for it)
is deferred until #40 lands a third duplicate and the pattern is proven across all three. `ponytail`: take
the refactor with #40, not speculatively now.

**Verification:** `tsc` clean; **234 tests still green** (the send-path is glue → F5-verified, not
unit-tested per the PRD; the mapping is a trivial field-rename, the real logic lives in the already-tested
`codexStream`/`bridge.ts`); **live F5 smoke** — panel Provider=Codex, signed in, Bridge Start → an
`Invoke-RestMethod` non-stream `POST` returned a real `chat.completion` from the **`codex`** Provider through
the **ChatGPT subscription** (`finish_reason:stop`, model echoed as the provider id). **Still pending** (same
as #38): a real **Copilot CLI session** over the Bridge (acceptance #5 + the long-outstanding #35 bullet),
plus the signed-out-401 and tool-call edges live. **Unblocks #40** (Anthropic, the last send-path).
**Reversibility:** easy/additive — edits to two files; revert to restore the codex `400`. No ADR.

## Related

- [[decisions]] — index
