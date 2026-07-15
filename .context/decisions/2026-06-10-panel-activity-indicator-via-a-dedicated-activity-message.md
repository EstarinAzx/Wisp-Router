---
type: decision
project: wisp
updated: 2026-06-10
tags: [context, decisions]
---

# Panel activity indicator via a dedicated `activity` message

**Decision:** Surface the extension's **Activity** (Thinking / Idle — see `CONTEXT.md`) in the side
panel as a top status row (pulse dot, "Thinking…"/"Idle", muted `opacity-50` when disabled), fed by a
**new lightweight `activity{thinking}`** ext→webview message. `enter/exitInFlight` push it via
`panel.postActivity(inFlight > 0)`; the `ready` handler pushes the current activity via a new
`PanelHost.getActivity()`. The webview holds `thinking` **separate** from `state`. The 4-state status
bar is left untouched; the panel shows only the two Activity states.
**Why:** the panel was the blind spot — the status bar already had thinking/idle. The signal is
high-frequency (per debounced keystroke); folding `thinking` into `state` was rejected because
`getState` is async and a `state` push also triggers the webview's model-refetch path, so firing it
per keystroke would be wasteful and semantically wrong. A dedicated synchronous boolean message is
cheap and decoupled. Pushing on `ready` too keeps a panel reopened mid-request correct.
**Reversibility:** easy (could merge `activity` into `state` later — minutes). No ADR: trivially reversible.

## Related

- [[decisions]] — index
