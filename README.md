# Wisp

**Wisp** — VS Code inline (ghost-text) completions, currently backed by the **OpenCode Zen** provider
(`https://opencode.ai/zen/go/v1`), an OpenAI-compatible API. Same integration pattern as the
reference `llm-provider`: the `openai` SDK pointed at the Zen base URL.

## How it works

OpenCode Zen has **no fill-in-middle (FIM) route**, so a chat model is prompted to act as a
completer: it receives the code on both sides of the caret (`prefix<CURSOR>suffix`) and returns
only the text to insert. Expect ~0.5–1.5 s latency — chat models are not sub-100 ms FIM engines.

**Two triggers, one ghost-text surface.** A **Completion** fires automatically as you type
(debounced, sends the prefix/suffix window around the caret, gated by the on/off toggle). **Inquire**
is manual: select lines, right-click → **Wisp: Inquire**, and the selection becomes the prompt with
the *whole file* as context — the generated code appears as ghost text on a new line **after** your
selection (append, never replace), and works even when autocomplete is toggled off. Both are accepted
with **Tab**; both return code only, never prose.

## Setup

```bash
npm install        # installs the openai SDK + dev types
npm run compile    # tsc → out/extension.js
```

Then press **F5** in VS Code to launch the Extension Development Host.

1. Run **Wisp: Set API Key** (Command Palette) — stored in the OS keychain, not in settings.
   (Alternatively set the `OPENCODE_API_KEY` environment variable before launching VS Code.)
   Get a key at <https://opencode.ai/auth>.
2. Start typing in any file. Ghost text appears after a short pause; **Tab** accepts.
3. The status-bar item (`✨ Wisp`) shows ready / thinking / error, and toggles on/off when clicked.

## Settings (`wisp.*`)

| Setting | Default | Purpose |
|---|---|---|
| `enabled` | `true` | Master on/off switch. |
| `baseUrl` | `https://opencode.ai/zen/go/v1` | OpenAI-compatible base URL. |
| `model` | `minimax-m3` | Model id. Use **Wisp: List / Choose Model** to discover valid ids. |
| `debounceMs` | `300` | Quiet window after the last keystroke. |
| `maxTokens` | `0` | Suggestion length cap. `0` = no limit; a positive value bounds latency. |
| `temperature` | `0.1` | Sampling temperature. |
| `maxPrefixChars` / `maxSuffixChars` | `2000` / `1000` | Context window sliced around the caret. |

## Commands

- **Wisp: Set API Key** — store the key in SecretStorage.
- **Wisp: List / Choose Model** — `GET /models`, pick one into the setting.
- **Wisp: Toggle Autocomplete** — enable/disable (also the status-bar click).
- **Wisp: Inquire** — select lines → the selection is the prompt, the whole file is context →
  insertable code as ghost text after the selection (append, never replace). Right-click menu (with a
  selection) or the palette; works even when autocomplete is off.

## Notes

- Per-request latency is logged to the **Wisp** output channel — use it to compare
  models and tune `model` / `maxTokens`.
- Not bundled (plain `tsc`). For `vsce package`/publishing, add esbuild/webpack bundling so the
  `openai` dependency is packed.
