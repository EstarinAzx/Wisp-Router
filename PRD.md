# PRD: Wisp — VS Code extension with side-panel control UI

## Problem Statement

As a developer, I want AI inline code completions in VS Code that route through my own provider
(OpenCode Zen, `https://opencode.ai/zen/go/v1`) instead of a third-party service, so I keep control
of which backend and model serve my code context.

Today the extension works but is **command-only**: I set my API key through a Command Palette input
box, change the model through a quick-pick, and toggle the feature through another command. There is
no single place to see whether my key is set, which model is active, and whether autocomplete is on
— and configuring it means remembering three separate commands. I want a visible control surface.

## Solution

Three parts, as experienced by the user:

1. **Inline completions** — as I type, ghost text suggestions appear after a short pause and I accept
   them with Tab. Suggestions come from a chat model on the OpenCode Zen endpoint, prompted to behave
   like a code completer (the endpoint has no fill-in-middle route). A status-bar item shows whether
   the extension is ready, thinking, disabled, or errored.

2. **A side panel** — a dedicated icon in the VS Code activity bar opens a Wisp panel where I
   can, in one place: set or clear my API key (shown only as "set / not set", never echoed back),
   choose my model from a live list fetched from the provider (or type a custom id), and flip
   autocomplete on/off. A status row at the top of the panel shows the live activity — "Thinking…"
   while a completion request is in flight, "Idle" otherwise (muted when autocomplete is disabled) —
   so the panel itself signals what the extension is doing. The panel and the existing commands stay
   in sync, and the UI matches my editor theme.

3. **Inquire — on-demand, whole-file code generation** — when I select lines in the editor (a comment
   describing what I want, or code to act on) and choose **Inquire** from the right-click menu, the
   extension sends the **whole file** as context with my selection as the instruction and returns
   insertable code as ghost text on a fresh line **after** my selection, accepted with Tab exactly
   like a completion. Unlike a completion it is **manually triggered**, reads the **entire file**
   (not just a prefix/suffix window), and works **even when autocomplete is toggled off**. A
   cancellable progress notification shows while it runs (a reasoning model over a whole file can be
   slow) and the status bar / panel show the same "Thinking…" Activity. Inquire returns **code only —
   never prose**; it is not a chat or an "explain this" feature.

## User Stories

1. As a developer, I want inline ghost-text completions as I type, so that I can write code faster
   without leaving the editor.
2. As a developer, I want to accept a suggestion with Tab, so that accepting is frictionless.
3. As a developer, I want completions routed through OpenCode Zen, so that I control the backend.
4. As a developer, I want a short debounce before a request fires, so that the extension does not
   spam the API on every keystroke.
5. As a developer, I want an in-flight request cancelled when I keep typing, so that stale
   suggestions never appear and I am not billed for abandoned requests.
6. As a developer, I want suggestions capped to a short length, so that latency stays low and
   suggestions feel snappy.
7. As a developer, I want multi-line suggestions when the model is confident, so that whole small
   blocks can be completed, not just single lines.
8. As a developer, I want the suggestion's repeated copy of my current line stripped out, so that
   ghost text does not show doubled code.
9. As a developer, I want markdown code fences stripped from suggestions, so that raw code is
   inserted, not fenced text.
10. As a developer, I want completions suppressed when I have a text selection, so that selecting is
    not interrupted by suggestions.
11. As a developer, I want completions suppressed while the native IntelliSense widget is open, so
    that I do not get two competing popups.
12. As a developer, I want no request fired when there is no meaningful code before the cursor, so
    that empty context does not waste calls.
13. As a developer, I want identical repeated requests at the same spot served from a cache, so that
    redundant calls cost nothing.
14. As a developer, I want a status-bar indicator of ready / thinking / disabled / error, so that I
    can tell at a glance whether the extension is working.
15. As a developer, I want to open a side panel from the activity bar, so that I have a home for all
    Wisp settings.
16. As a developer, I want to enter my API key in the panel, so that I do not have to remember a
    command.
17. As a developer, I want my key stored securely in the OS keychain, so that it is never written to
    plaintext settings or synced to the cloud.
18. As a developer, I want the panel to show only whether a key is set (not the key itself), so that
    my secret is never displayed or leaked through the UI.
19. As a developer, I want to clear my stored key from the panel, so that I can revoke it easily.
20. As a developer, I want to pick my model from a live list fetched from the provider, so that I
    only choose models that actually exist.
21. As a developer, I want to refresh the model list on demand, so that I see newly added models.
22. As a developer, I want to type a custom model id the list does not advertise, so that I am not
    limited to discovered ids.
23. As a developer, I want my model choice persisted to settings, so that it survives restarts and is
    visible in settings.json.
24. As a developer, I want to toggle autocomplete on/off from the panel, so that I can pause it
    without hunting for a command.
25. As a developer, I want the panel, the status bar, and the toggle command to always reflect the
    same state, so that the controls never disagree.
26. As a developer, I want the panel themed to my editor (light/dark/high-contrast), so that it does
    not look foreign.
27. As a developer, I want a clear error in the panel if the live model fetch fails, so that I know
    when my key is missing or the endpoint is unreachable.
28. As a developer, I want per-request latency logged to an output channel, so that I can compare
    models and tune settings with real data.
29. As a developer, I want to change the model, base URL, debounce, max tokens, and context window in
    settings, so that I can tune behavior to my taste.
30. As a developer, I want the extension to fall back to an environment variable for the key, so that
    I can run it in a headless/dev setup without the UI.
31. As a developer, I want the existing commands (Set API Key, List/Choose Model, Toggle) to keep
    working, so that nothing I already use breaks when the panel is added.
32. As a developer, I want the side panel to show whether the extension is thinking or idle, so that
    I can tell at a glance what it is doing without looking at the status bar.
33. As a developer, I want to select lines and trigger a suggestion on demand from the right-click
    menu, so that I get a suggestion exactly when I want one, not only while typing.
34. As a developer, I want that on-demand suggestion to use my whole file as context, so that the
    generated code fits the rest of my script (real variable and function names), not just the lines
    around the caret.
35. As a developer, I want to write intent as a comment, select it, and get the implementing code, so
    that I can describe what I want in plain language and have it written below.
36. As a developer, I want the generated code inserted on its own line after my selection (never
    replacing it), so that I never lose the lines I selected.
37. As a developer, I want Inquire to work even when autocomplete is disabled, so that I can keep
    automatic suggestions off but still ask for one deliberately.
38. As a developer, I want a cancellable progress indicator while Inquire runs, so that I know it is
    working and can abort if I picked the wrong lines or the wrong moment.
39. As a developer, I want a clear message if I trigger Inquire with no selection or no API key, so
    that I understand why nothing happened.

## Implementation Decisions

- **Chat-as-completer (no FIM).** OpenCode Zen exposes only OpenAI-compatible chat completions; there
  is no fill-in-middle endpoint. A chat model is given the code on both sides of the caret
  (`prefix<CURSOR>suffix`) and instructed to return only the insertion. Accepted latency target is
  ~0.5–1.5s; sub-100ms FIM-style speed is explicitly not a goal.
- **Non-streaming requests.** The VS Code inline API resolves a suggestion once, so streaming offers
  no perceived-latency benefit; requests are non-streaming with a small token cap.
- **Adaptive short completions.** A low max-token cap with no hard newline-stop keeps latency inside
  target while still allowing short multi-line blocks.
- **Provider integration** mirrors the reference `llm-provider`: the OpenAI SDK pointed at the Zen
  base URL, Bearer auth handled by the SDK.

**Inquire — on-demand whole-file code generation (added 2026-06-14):**

- **Insertable code only, selection-as-prompt.** Inquire returns code to insert, never prose; the
  selected lines *are* the instruction (a comment → its implementation; code → context to act on).
  A free-text question box and prose/chat answers were rejected — they need a non-ghost surface and a
  different interaction model (see Out of Scope).
- **Append after the selection, never replace.** The caret collapses to the end of the selection and
  the result renders as ghost text on a fresh line below. Replacing the selection was rejected: a
  loose reasoning model returning junk would destroy the user's code, against the fail-safe ethos of
  the cleanup pipeline (which "never deletes code").
- **Whole file as context, with a size guard.** The entire file is sent as context; above a
  ~32k-char threshold it falls back to a large window around the selection (reusing the completion
  context slicer with bigger limits) plus a "file too big — used nearby context" notice, so a huge
  file degrades gracefully instead of overflowing the model's context window.
- **Independent of the `enabled` toggle.** Inquire is a deliberate action, so it runs even when
  automatic completion is off: its result path runs before the provider's enabled / selection /
  debounce gates, and it bypasses the single-entry completion cache.
- **Manual ghost-text trigger.** The command stashes a pending Inquiry result keyed to the document +
  collapsed caret and fires `editor.action.inlineSuggest.trigger`; the inline provider returns the
  stash for the matching position, then clears it. **Risk:** inline suggestions are normally
  keystroke-driven — this manual-trigger path is validated with a throwaway spike before the rest is
  built.
- **Feedback.** A cancellable `vscode.window.withProgress` notification (Cancel wired to the existing
  `AbortController`) plus the existing status-bar / panel Activity ("Thinking…"). Reuses
  `stripThink` / `stripFences` / `relocateAfterComment`; reuses the existing `model` setting (no
  separate Inquire model in v1).

Modules to build or modify (interfaces, not file paths):

- **M1 — Suggestion cleanup (pure, deep).** `cleanSuggestion(prefix, rawText) → insertText`.
  Encapsulates fence stripping and longest-prefix-overlap trimming behind one call; no VS Code
  dependency. This is where the "doubled line" and fence quirks of chat-as-completer are contained.
- **M2 — Completion context (pure, deep).** `buildContext(text, offset, limits) → { prefix, suffix }`
  and a prompt builder. Pure slicing/formatting, no VS Code dependency.
- **M3 — ProviderClient (thin wrapper).** Constructed from `{ apiKey, baseURL }`; exposes
  `listModels()` and `complete(messages, options, signal)`. Hides the OpenAI SDK and the endpoint
  behind a stable interface; rebuilt only when key or base URL changes. This is the **Provider**
  boundary in code (see `CONTEXT.md`) — named for the role, not the current instance.
- **M4 — Config/Secrets facade (VS Code-coupled).** `getState()` →
  `{ keyIsSet, model, enabled, baseUrl }`, plus `storeApiKey`, `clearApiKey`, `setModel`,
  `setEnabled`. The key lives in SecretStorage with an environment-variable fallback; it is never
  read from or written to plaintext settings.
- **M5 — SidePanelProvider (VS Code glue).** A WebviewView provider that serves an HTML shell with a
  strict Content-Security-Policy and a per-load script nonce, loads the bundled UI assets via
  `asWebviewUri`, routes messages, and can push fresh state to the webview when configuration changes
  outside the panel.
- **M6 — Webview UI (Preact + Tailwind v4) and message protocol.** A small Preact app (top activity
  status row with a pulsing dot — "Thinking…" / "Idle", muted when disabled; key row; model picker
  with live list + manual override + refresh; enabled switch), themed via `--vscode-*` CSS variables,
  built by Vite into a single deterministic JS + CSS asset.

Architectural decisions:

- **Two independent build pipelines.** The extension (Node) compiles with `tsc`; the webview UI
  (browser) bundles with Vite using the Preact preset and the first-party Tailwind v4 plugin. Vite is
  configured for a single, unhashed JS + CSS output so the extension can reference assets by fixed
  path. The two TypeScript configs are kept separate so the extension compiler never sees browser JSX.
- **Activity-bar side panel.** A new view container with its own icon hosts a single webview-type
  view.
- **Message contract.** Webview → extension: `ready`, `setApiKey`, `clearApiKey`, `selectModel`,
  `setEnabled`, `refreshModels`. Extension → webview: `state` (including `keyIsSet`, never the key),
  `models` / `modelsError`, and `activity` (`{ thinking }`) — a lightweight in-flight signal pushed
  on every request transition (and on `ready`), kept separate from `state` so the high-frequency
  activity ping does not drag the heavyweight async `getState`/model-refetch path.
- **Write-only key in the UI.** The API key is only ever sent from the webview to the extension; the
  extension returns a boolean "is set", never the value. The cached client is invalidated whenever the
  key changes.
- **Shared helpers.** The existing command handlers and the new panel both call the same M4/M3
  helpers, so the panel, status bar, and commands cannot drift out of sync.
- **Deprecated toolkit avoided.** The archived VS Code Webview UI Toolkit is not used; theming is done
  directly with `--vscode-*` variables and Tailwind utilities.

## Testing Decisions

- **What makes a good test here:** tests assert external behavior through a module's public
  interface, not its internals. The strongest candidates are the pure modules that take inputs and
  return outputs with no VS Code dependency, so they run fast in a plain test runner with no editor
  harness.
- **Modules to be tested (confirmed):**
  - **M1 — Suggestion cleanup.** Cover: a fenced block is unwrapped to raw code; a suggestion that
    repeats the current-line prefix is trimmed to just the new text (the doubled-line case);
    overlapping at various boundary lengths; a suggestion with no overlap is returned unchanged; an
    empty or whitespace-only suggestion yields no insertion.
  - **M2 — Completion context.** Cover: prefix and suffix are sliced to the configured limits around
    a caret offset; near the start/end of a document the slices clamp correctly; the prompt is
    assembled with the cursor marker between prefix and suffix.
- **Prior art:** none yet in this greenfield project; these become the first unit tests and the
  pattern (pure-function tests, no VS Code mocking) for future ones.
- **Not unit-tested:** M3–M6 are VS Code/SDK/DOM-coupled glue and are verified by manual end-to-end
  checks (launch the Extension Development Host, exercise the panel) rather than unit tests. M3 could
  later get light tests against a stubbed SDK if its surface grows.

## Out of Scope

- A fill-in-middle (FIM) model or endpoint — the provider does not offer one.
- Streaming ghost text — the inline API resolves once; not pursued.
- Multi-suggestion cycling, "explain this completion", chat, or any conversational UI in the panel.
- Telemetry/usage accounting beyond the local latency log.
- Workspace-level (vs global) settings targeting for model/enabled.
- Bundling/packaging the extension for the Marketplace (a bundler step for `vsce package`) — noted as
  a later concern, not part of this PRD.
- Per-language enable/disable rules and string/comment-aware trigger gating.
- **Inquire deferred modes** (possible later, not in v1): a free-text question box (a typed prompt in
  addition to the selection); prose / explanation answers (would need a non-ghost surface — panel or
  hover — and a different interaction model); a replace/transform mode that swaps the selection for
  the generated code; a separate, stronger model for Inquire.

## Further Notes

- The default model ships as the value proven to work against the `go` endpoint in the reference
  provider; the live model list + manual override let the user move to a faster/better code model
  (e.g. a GLM- or Kimi-class id) once they compare the latency log.
- Highest implementation risk is the webview Content-Security-Policy interacting with how Tailwind v4
  emits styles. With a Vite production build the CSS is a static linked stylesheet, so the strict CSP
  (script nonce + `cspSource` styles) should suffice; `'unsafe-inline'` for styles is a documented
  fallback only if the webview console reports a violation.
- The whole design was settled through a prior decision-by-decision review covering latency target,
  completion scope, streaming, key storage, model selection, trigger gating, caching, status
  feedback, and prefix-overlap handling; those decisions are reflected above.
