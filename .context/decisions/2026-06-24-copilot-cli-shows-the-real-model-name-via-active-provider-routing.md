---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Copilot CLI shows the real model name, via active-Provider routing fallback (#b)

**Decision:** Inject `COPILOT_MODEL` = the active Provider's **resolved model name** (`activeModel()`), not its
Provider id, so Copilot CLI's UI shows the real model. To keep routing working, `handleChat` now routes a
Provider **id** to that Provider (curl keeps explicit addressing) and **any other value** — notably the resolved
model name Copilot sends — to the **active Provider** (`deps.activeProviderId()`, new `BridgeDeps` getter). The
env label re-syncs on provider **or** model switch.

**Why:** Copilot CLI renders `COPILOT_MODEL` **verbatim** as its model label and does not read the custom
endpoint's `/v1/models`; the only lever for the label is that env var. Changing it to the model name forces the
routing change. Chose the **loose** active-Provider fallback over a tight model-name match because the model name
lives in the terminal env (fixed at launch) — a tight match would 404 after any mid-session model switch. The
loose fallback keeps the model **used** live (`resolveModel` per request) while the **label** is a launch-time
snapshot. Tradeoff accepted: (1) an unknown model no longer 404s — it serves the active Provider (fine for a
local single-user endpoint); (2) running Copilot terminals now **follow the active Provider** (they send a model
name, not an id) rather than being pinned to their launch Provider. curl addressing each Provider by id is
preserved.

**Verification:** `tsc` clean, **234 tests green**, full compile clean. Routing proven on the compiled
`out/bridgeServer.js` via a node harness (3/3 HTTP cases) AND end-to-end with the **real `@github/copilot`
v1.0.64 binary** — its JSON event stream reported `data.model:"minimax-m3"` (resolved name, not the id) and
round-tripped through our Bridge (`apiCallId:chatcmpl-…`). The interactive `Current model:` banner is the human
render of that same `data.model` field; the only step not run is a reload of the user's live Extension Host.
**Reversibility:** easy — three small edits; revert `injectCopilotEnv` to `activeProvider().id` and drop the
fallback to restore strict id-routing. No ADR.

## Related

- [[decisions]] — index
