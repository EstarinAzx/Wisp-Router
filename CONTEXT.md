# Wisp

A VS Code extension that serves AI inline completions from the OpenCode Zen chat
endpoint, with a side panel for managing key, model, and on/off state. This
glossary fixes the language for the extension's user-visible state, so the two
status surfaces (status bar and side panel) describe the same thing the same way.

## Language

### Product and provider

**Wisp**:
The product — the VS Code extension itself, and the name on all user-visible
chrome (activity-bar container, side panel, status bar, commands `wisp.*`,
settings `wisp.*`, the `wisp.apiKey` secret). Provider-agnostic by design so
more **Providers** can be added later. "The extension" is used interchangeably;
reserve **Wisp** for user-facing chrome and the product-vs-**Provider** split.

**Provider**:
The external backend Wisp routes **Completion** and **Inquire** requests through
— an OpenAI-compatible chat endpoint plus the credentials to reach it (base URL
+ API key). Wisp is **provider-agnostic**: a Provider is a swappable role, not a
fixed dependency. Today there is exactly one. Providers are named **vendor +
product line** (e.g. "OpenCode Zen", a hypothetical "Anthropic Claude"). _Avoid_:
treating the Provider as part of the product's identity, or assuming there will
only ever be one. (How a Provider is *reached* — the `/go` gateway, the bare-id
rule — is an implementation detail, not part of its name; see `gotchas.md`.)

**OpenCode Zen**:
The current, first, and only **Provider** — the OpenAI-compatible chat endpoint
at `https://opencode.ai/zen/go/v1`, with the `OPENCODE_API_KEY` environment-
variable fallback. Canonically **"OpenCode Zen"** (vendor *OpenCode* + product
*Zen*) — never bare "OpenCode" or "Zen". The product *has* a Provider; the
Provider keeps its own name. _Avoid_: calling the product "OpenCode".

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

### How code is suggested — Completion and Inquire

**Suggestion**:
Ghost text the extension proposes for insertion at the caret, accepted with Tab.
It is always **insertable code**, never prose. Two triggers produce a Suggestion —
**Completion** and **Inquire** — both rendering on the same ghost-text surface.
_(Resolves the earlier overload: "suggestion" names the surface, not one feature.)_

**Completion**:
The **automatic** Suggestion. Fires while typing (debounced), sends only the
**prefix/suffix window** around the caret as context, is gated by the **enabled**
toggle, and is suppressed while a selection is active.

**Inquire**:
The **manual** Suggestion. The user selects lines and invokes **Inquire** (editor
right-click); the extension treats the **selection as the prompt** and the **whole
file** as context, and returns insertable code as a Suggestion. Works **even when
Completion is disabled** — Inquire ignores the **enabled** toggle.
_Avoid_: calling Inquire a "chat", "ask", or "explanation" — it returns code, never prose.

**Selection-as-prompt**:
For **Inquire**, the highlighted lines *are* the instruction — a comment describing
intent (→ generate the code), or code to act on — not merely a caret location.

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
