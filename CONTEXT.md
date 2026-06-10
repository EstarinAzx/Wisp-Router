# OpenCode Autocomplete

A VS Code extension that serves AI inline completions from the OpenCode Zen chat
endpoint, with a side panel for managing key, model, and on/off state. This
glossary fixes the language for the extension's user-visible state, so the two
status surfaces (status bar and side panel) describe the same thing the same way.

## Language

### Activity — what the extension is doing right now

**Activity**:
The extension's live processing state, with exactly two values — **Thinking** or
**Idle**. Derived from the in-flight request count, not from enabled/error.

**Thinking**:
At least one completion request is in flight (awaiting the Zen endpoint).
_Avoid_: busy, loading, working, processing.

**Idle**:
No completion request is in flight — the extension is waiting for input.
_Avoid_: ready (that word is reserved for the status bar's healthy-idle label), waiting, free.

### Where Activity is shown

**Status bar**:
The editor-surface indicator. Shows four labels — `disabled`, `thinking`,
`error`, `ready` — where **ready** = **Idle** *and* enabled *and* no last error.
So the status bar's "ready" is one specific dressing of the **Idle** Activity.

**Panel indicator**:
The side-panel-surface indicator. Shows the **Activity** directly as two states —
"Thinking…" / "Idle" — and is **muted** (dimmed) when autocomplete is disabled.
Does not show `error` (that stays the status bar's job).

**Muted**:
The panel indicator's dimmed appearance when autocomplete is **disabled** — a
visual third dressing, not a third **Activity** value. Activity stays Idle.

## Relationships

- **Activity** has exactly two values: **Thinking** | **Idle**.
- Both the **Status bar** and the **Panel indicator** render the same **Activity**;
  they are two surfaces, never two sources of truth.
- The **Status bar** dresses **Idle** as `ready`/`disabled`/`error`; the
  **Panel indicator** dresses it as `Idle` / muted-`Idle`.

## Example dialogue

> **Dev:** "If autocomplete is toggled off, is the panel showing **Idle** or a
> third 'off' state?"
> **Owner:** "Still **Idle** — there's no request in flight. 'Off' is just the
> **Muted** dressing of **Idle**, not a new **Activity** value."
> **Dev:** "And the status bar's **ready**?"
> **Owner:** "Same **Idle**, dressed for the editor — it only says 'ready' when
> we're **Idle** *and* enabled *and* the last request didn't error."

## Flagged ambiguities

- "idle" vs "ready" — used interchangeably at first. Resolved: **Idle** is the
  canonical **Activity** value (the panel's label); **ready** is the status bar's
  label for healthy-**Idle** only. Same concept, two surface labels.
- "disabled" as an Activity — rejected. Disabled is a **Muted** dressing of
  **Idle**, not a value of **Activity**.
