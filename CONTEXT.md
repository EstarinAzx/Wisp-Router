# Wisp

A VS Code extension that performs AI inline code edits (**Inquire**) through a
catalog of OpenAI-compatible **Providers**, with a side panel for managing the
Active Provider's key and model. This glossary fixes the language for the
extension's user-visible state, so the two status surfaces (status bar and side
panel) describe the same thing the same way.

## Language

### Product and provider

**Wisp**:
The product — the VS Code extension itself, and the name on all user-visible
chrome (activity-bar container, side panel, status bar, commands `wisp.*`,
settings `wisp.*`, the `wisp.apiKey` secret). Provider-agnostic by design so
more **Providers** can be added later. "The extension" is used interchangeably;
reserve **Wisp** for user-facing chrome and the product-vs-**Provider** split.

**Provider**:
The external backend Wisp routes **Inquire** requests through
— an OpenAI-compatible chat endpoint plus the credentials to reach it (base URL
+ API key). Wisp is **provider-agnostic**: a Provider is a swappable role, not a
fixed dependency. Wisp ships a **Provider catalog** of several; exactly one is the
**Active Provider** at a time. Providers carry a **canonical vendor name** (e.g.
"OpenCode Zen", "Groq", "Mistral", "KiloCode"). _Avoid_: treating the Provider as
part of the product's identity, or assuming there is only one. (How a Provider is
*reached* — the `/go` gateway, the bare-id rule — is an implementation detail, not
part of its name; see `gotchas.md`.)

**Active Provider**:
The one **Provider** currently selected; all **Inquire** requests route through
it. Exactly one is Active at a time. Switching the Active
Provider re-scopes which API key and which model are in effect — each Provider
remembers its own. _Avoid_: implying several Providers serve requests at once.

**Provider catalog**:
The set of **built-in Providers** Wisp ships ready-made — each a canonical name
paired with its base URL, default model, and API-key environment variable.
Curated, not exhaustive; **OpenCode Zen** is the default and first entry. _Avoid_:
treating the catalog as the limit — a **Custom Provider** reaches anything else.

**Built-in Provider** / **Custom Provider**:
A **built-in Provider** is a catalog preset whose base URL is fixed in code (the
user supplies only a key and picks a model). A **Custom Provider** is the escape
hatch: the user supplies base URL and model themselves, for any OpenAI-compatible
endpoint not in the catalog. _Avoid_: exposing a built-in's base URL as
user-editable — it is fixed on purpose (a security property; see `gotchas.md`).

**OpenCode Zen**:
The **default** Provider and first catalog entry — the OpenAI-compatible chat
endpoint at `https://opencode.ai/zen/go/v1`, with the `OPENCODE_API_KEY`
environment-variable fallback. Canonically **"OpenCode Zen"** (vendor *OpenCode* + product
*Zen*) — never bare "OpenCode" or "Zen". The product *has* a Provider; the
Provider keeps its own name. _Avoid_: calling the product "OpenCode".

### Activity — what the extension is doing right now

**Activity**:
The extension's live processing state, with exactly two values — **Thinking** or
**Idle**. Derived from the in-flight request count, not from enabled/error.

**Thinking**:
At least one **Inquire** request is in flight (awaiting the Provider).
_Avoid_: busy, loading, working, processing.

**Idle**:
No **Inquire** request is in flight — the extension is waiting for input.
_Avoid_: ready (that word is reserved for the status bar's healthy-idle label), waiting, free.

### Where Activity is shown

**Status bar**:
The editor-surface indicator. Shows three labels — `thinking`, `error`,
`ready` — where **ready** = **Idle** *and* no last error. So the status bar's
"ready" is one specific dressing of the **Idle** Activity.

**Panel indicator**:
The side-panel-surface indicator. Shows the **Activity** directly as two states —
"Thinking…" / "Idle". Does not show `error` (that stays the status bar's job).

### How code is edited — Inquire

**Inquire**:
Wisp's single feature — an AI inline **edit**. The user invokes Inquire
(`Ctrl+Shift+I`, the editor right-click menu, or the command palette), types a
natural-language **instruction**, and Wisp rewrites the **target span** to satisfy
it. The result is shown as a confirmable diff (VS Code's native refactor-preview)
that the user accepts or rejects; one replace covers both adding and removing
lines. _Avoid_: calling Inquire a "chat", "ask", or "completion" — it returns an
**edit** (replacement code for the span), applied through a preview, not ghost text.

**Instruction**:
The natural-language request the user types into Inquire's input box (e.g. "make
findBy reject a null predicate"). It describes the change; it is not itself code.
_Avoid_: confusing the instruction (what to change) with the target span (what
gets rewritten).

**Target span**:
The range Inquire rewrites — the current **selection**, or the whole current line
when nothing is selected. Inquire replaces this span entirely (so it can add or
delete lines), using the **whole file** as context.

## Relationships

- **Activity** has exactly two values: **Thinking** | **Idle**.
- Both the **Status bar** and the **Panel indicator** render the same **Activity**;
  they are two surfaces, never two sources of truth.
- The **Status bar** dresses **Idle** as `ready` (or `error` after a failure); the
  **Panel indicator** shows it as `Idle`.

## Example dialogue

> **Dev:** "After an Inquire edit finishes, is the panel showing **Idle** or
> **ready**?"
> **Owner:** "The panel says **Idle** — there's no request in flight. **ready** is
> the *status bar's* dressing of that same **Idle**, shown when the last request
> didn't error."
> **Dev:** "And while the model is working?"
> **Owner:** "Both surfaces show **Thinking** — the status bar spins, the panel
> dot pulses."

## Flagged ambiguities

- "idle" vs "ready" — used interchangeably at first. Resolved: **Idle** is the
  canonical **Activity** value (the panel's label); **ready** is the status bar's
  label for healthy-**Idle** only. Same concept, two surface labels.
- "Inquire as completion" — rejected. Inquire produces an **edit** (a previewed
  span replacement), not ghost-text **Completion**. Completion was removed; Wisp
  is Inquire-only.
