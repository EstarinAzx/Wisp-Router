---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Copilot CLI label is a launch snapshot; running terminals follow the ACTIVE Provider (#b)

`COPILOT_MODEL` = the resolved **model name** (not the Provider id) so Copilot's UI shows the real model — but the
env is fixed at terminal creation, so the **label** is a snapshot from launch. The model **used** stays live
(Bridge re-resolves per request). Consequence of the loose routing fallback: a running Copilot terminal sends a
model name (not an id), which routes to whatever the **active** Provider is *now* — so switching the panel Provider
makes open terminals follow it, rather than staying pinned to their launch Provider. curl can still address a
specific Provider by its **id** (`codex`/`anthropic`/`opencode-go`).

## Related

- [[gotchas]] — index
