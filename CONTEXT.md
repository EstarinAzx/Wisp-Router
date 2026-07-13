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
— a chat endpoint plus the credentials to reach it: for most Providers an
OpenAI-compatible base URL + API key, or — for a **Codex Provider** — an OAuth
sign-in. Wisp is **provider-agnostic**: a Provider is a swappable role, not a
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

**Provider kind**:
The three shapes a Provider can take. An **API-key Provider** (most catalog
entries) reaches an OpenAI-compatible chat endpoint with a Bearer API key. A
**Codex Provider** is reached by **signing in** with a ChatGPT account instead of
a key, and runs OpenAI's Codex models against that account's subscription. An
**Anthropic Provider** is likewise reached by signing in — with a Claude.ai
account. _Avoid_: treating an OAuth Provider as just another keyed row — it
authenticates by sign-in, not a key, and its endpoint is not OpenAI
chat-completions (see `gotchas.md`).

**Codex Provider**:
The Provider reached by **signing in to Codex** (a ChatGPT-account OAuth flow)
rather than supplying an API key — it runs OpenAI's Codex models on the user's
own ChatGPT subscription. It is **built-in** (its endpoint is fixed in code) but
credentialed by sign-in, not a key. Whether the user is **signed in** (not
whether a key is set) is what makes it usable. _Avoid_: calling it an API-key
Provider, or implying it uses Wisp's own account — it is the user's subscription.

**Anthropic Provider**:
The Provider reached by **signing in to Claude** (a Claude.ai-account OAuth flow)
rather than supplying an API key — it runs Anthropic models on the user's own
Claude subscription through the Messages API. Like the **Codex Provider** it is
**built-in** but credentialed by sign-in; whether the user is **signed in** is
what makes it usable. _Avoid_: calling it an API-key Provider, or implying it
uses Wisp's own account — it is the user's subscription.

**Effort** (reasoning effort):
How hard a **Codex Provider** model thinks — `low` / `medium` / `high` / `xhigh`,
sent as the Codex `reasoning.effort`. One value scoped to the **Codex Provider** (not
per-model), set in the **side panel** and mirrored in VS Code's model-picker
label. Governs **every** Codex call — both **Inquire** and the chat/picker path
— so it is the Provider's reasoning depth, not a per-surface setting. Inert for
Codex's non-reasoning models (`spark`, `gpt-4.x`), which reject reasoning.
_Avoid_: confusing Effort (reasoning depth, the user's to set) with GitHub
Copilot's **request multiplier** (the `·3x` billing weight shown on GitHub's
*own* models — Wisp neither sets nor sees it).

**OpenCode Go** / **OpenCode Zen**:
Two distinct **Providers** from the vendor *OpenCode*, told apart by endpoint.
**OpenCode Go** is the **default** and first catalog entry — the OpenAI-compatible
chat endpoint at `https://opencode.ai/zen/go/v1`, with the `OPENCODE_API_KEY`
environment-variable fallback. **OpenCode Zen** is the sibling endpoint at
`https://opencode.ai/zen/v1`. Both are canonically two words (vendor *OpenCode* +
the variant) — never bare "OpenCode" or "Zen". The product *has* these Providers;
each keeps its own name. _Avoid_: calling the product "OpenCode"; conflating the
two — "OpenCode Zen" historically (mis)named the **Go** endpoint, but they are now
separate Providers with the *Zen* name belonging to `/zen/v1`.

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
Wisp's inline-edit feature (alongside the Copilot-harness model router) — an AI inline **edit**. The user invokes Inquire
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

### Reaching Wisp from outside — the Bridge

**Bridge**:
A local endpoint Wisp can expose so tools **outside** VS Code reach the
**Provider catalog** as if it were one ordinary backend. It speaks two
dialects — **OpenAI** (`/v1/chat/completions`, e.g. the GitHub Copilot CLI) and
**Anthropic Messages** (`/v1/messages`, e.g. Claude Code) — through the same
listener and secret. It faces **outward** — the mirror of the **LM Chat
Provider**, which surfaces Wisp's models *inward* into VS Code's own chat. An
external tool names a **Provider**; Wisp answers with that Provider's selected
model, routing the request through the same path every other surface uses; a
model name matching no Provider falls back to the **Active Provider**. The
Bridge holds no credentials of its own: it carries a single local access secret
so only an authorised local tool may use it, while the real **Provider** auth
(API key or sign-in) is supplied by Wisp and **never leaves it** — to a backend
the traffic is indistinguishable from Wisp's other surfaces. **Off by default**;
the user turns it on. _Avoid_: calling the Bridge a **Provider** (a Provider is a
backend Wisp talks *out* to; the Bridge is the door *in*), or implying an
external tool ever sees your keys or sign-in tokens — they never do.

**Routing map**:
The **Bridge**'s user-configured table deciding which **Provider** (and which of
its models) answers a request whose model name is not a Provider id. Consulted
after the Provider-id match and before the **Active Provider** fallback; both
Bridge dialects share the one map. Holds two kinds of rows — four fixed **Family
routes** and any number of user-added **Aliases** — each pointing at a
**Target**. A name matching no row falls back to the **Active Provider**,
exactly as before the map existed. _Avoid_: wildcard/pattern language — rows
match a family or an exact name, never a user-written pattern.

**Family route**:
One of the four fixed **Routing map** rows — **Opus**, **Sonnet**, **Haiku**,
**Fable** — catching every `claude-*` model id of that family, whatever its
version or date suffix (e.g. `claude-opus-4-8` and a dated haiku snapshot both
land on their family's row). An unset Family route routes nothing — its traffic
falls through to the **Active Provider**. _Avoid_: treating a Family route as an
**Alias** — it matches a whole family fuzzily, not one exact name.

**Alias**:
A user-invented exact model name (e.g. `sol`, `gpt`) added to the **Routing
map** and routed to its **Target**. Matched exactly — a more specific Alias
(a full `claude-*` id) therefore beats the **Family route** that would otherwise
catch it. Advertised as a selectable model on the Bridge's OpenAI-dialect model
list; an external tool typing the Alias gets the Target, no panel visit needed.
An Alias may not collide with a Provider id. _Avoid_: expecting an Alias to
appear inside Claude Code's own model menu — that menu is Claude Code's; the
Alias is typed, then sticks.

**Target**:
What a **Routing map** row points at: a **Provider** plus a pinned model. The
pinned model overrides that Provider's panel-selected model for requests through
that row — so two names can run two different models of the same Provider at
once. A Target whose Provider is unusable (no key / signed out) fails loud with
the Provider's real error; it never silently falls back. _Avoid_: a Target with
an unpinned model — the pin is the point.

### The TUI face — planned (decisions settled, not yet built)

**Wisp TUI**:
The terminal app that becomes the face of Wisp and its **only** config surface —
an ASCII brand splash over a slash-command palette (`/providers`, `/signin`,
`/routing`, `/test`, …). It replaces the **side panel**; **Inquire** retires with
it, and the extension keeps only VS Code chat routing. _Avoid_: calling the TUI a
chat or an agent — plain text is not sent to a model (the `/test` command is the
one deliberate exception).

**Wisp home**:
The per-user shared store (`~/.wisp/`) both faces read: settings, catalog state,
and the **Routing map** in a config file; API keys and OAuth tokens in
`auth.json`. Replaces VS Code SecretStorage as the home of secrets. _Avoid_:
implying the extension and the TUI each keep their own state — one store, two
readers.

**wisp serve**:
The headless way to run the **Bridge** — the same Wisp process with no screen
drawn. After the split the Bridge (both dialects) lives with the TUI side, never
the extension. _Avoid_: calling it a daemon — nothing detaches, auto-starts, or
manages pids; it is just Wisp running without its face.

**claude-wisp**:
The launcher command that starts Claude Code pre-wired to the **Bridge**: it sets
the connection environment on the child process only and passes every argument
through verbatim. _Avoid_: implying it configures anything — it launches; the
Bridge must already be up (it fails friendly, never auto-starts one).

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
