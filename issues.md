# Issues — Panel activity indicator

Local issue tracker (repo is non-git). One tracer-bullet vertical slice.
Vocabulary per `CONTEXT.md`: **Activity = Thinking | Idle**.

---

## Issue 1 — Side-panel activity indicator (Thinking / Idle)

**Type:** AFK
**Blocked by:** None — can start immediately.
**User stories:** #32 (panel analogue of #14, per `PRD.md`).

### What to build

A live activity indicator in the side panel, end-to-end through all layers. The
extension already tracks in-flight completion requests for the status bar
(`inFlight`); surface that same **Activity** in the webview as a top status row.

- Extension posts a lightweight `activity` message — `{ type: 'activity', thinking }` —
  on every in-flight transition **and** on the webview's `ready` message (so a
  request already in flight when the panel reopens shows correctly).
- Kept **separate** from the heavyweight `state` message — no async `getState`,
  no model-refetch path on the high-frequency activity ping.
- The webview holds `thinking` as its own state and renders a **top status row**
  (above API Key) with a **pulse dot**: "Thinking…" while in flight, "Idle"
  otherwise. The row is **muted** (`opacity-50`) when autocomplete is disabled
  (`state.enabled` false) — muting is a dressing of Idle, not a third Activity value.
- **Status bar is untouched** (still `ready / thinking / disabled / error`).

### Files

- `src/extension.ts` — `enterInFlight`/`exitInFlight` also call `panel?.postActivity(...)`.
- `src/sidePanelProvider.ts` — `postActivity(thinking)` method (mirrors `postState`'s
  disposed-view guard); `ready` handler also pushes current activity.
- `webview/app.tsx` — `activity` added to `InMsg`; `thinking` state; top status row + pulse dot.
- `CONTEXT.md`, `PRD.md` — already updated.

### Acceptance criteria

- [ ] `enterInFlight`/`exitInFlight` call `panel?.postActivity(true/false)` in addition to `renderStatus()`.
- [ ] `postActivity` posts `{ type: 'activity', thinking }` only when a view exists (no-op when hidden), mirroring `postState`.
- [ ] The `ready` handler pushes the current activity (`inFlight > 0`) alongside the first `postState`.
- [ ] Webview keeps `thinking` separate from `state`; renders a top row above API Key: pulse dot + "Thinking…" / "Idle".
- [ ] Row is muted (`opacity-50`) when `state.enabled` is false; un-mutes when re-enabled — live.
- [ ] No new term leaks: panel reads "Thinking…" / "Idle"; status bar wording unchanged.
- [ ] `tsc -p ./` and `tsc -p webview` clean; `vite build` clean.
- [ ] Manual verify in the Extension Development Host (F5): typing fires a request → dot pulses "Thinking…", settles to "Idle"; toggle off → row greys.
