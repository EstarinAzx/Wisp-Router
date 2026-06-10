# OpenCode Zen Autocomplete

VS Code inline (ghost-text) completions routed through the OpenCode Zen **go** endpoint
(`https://opencode.ai/zen/go/v1`), an OpenAI-compatible API. Same integration pattern as the
reference `llm-provider`: the `openai` SDK pointed at the Zen base URL.

## How it works

OpenCode Zen has **no fill-in-middle (FIM) route**, so a chat model is prompted to act as a
completer: it receives the code on both sides of the caret (`prefix<CURSOR>suffix`) and returns
only the text to insert. Expect ~0.5–1.5 s latency — chat models are not sub-100 ms FIM engines.

## Setup

```bash
npm install        # installs the openai SDK + dev types
npm run compile    # tsc → out/extension.js
```

Then press **F5** in VS Code to launch the Extension Development Host.

1. Run **OpenCode: Set API Key** (Command Palette) — stored in the OS keychain, not in settings.
   (Alternatively set the `OPENCODE_API_KEY` environment variable before launching VS Code.)
   Get a key at <https://opencode.ai/auth>.
2. Start typing in any file. Ghost text appears after a short pause; **Tab** accepts.
3. The status-bar item (`✨ OpenCode`) shows ready / thinking / error, and toggles on/off when clicked.

## Settings (`opencodeAutocomplete.*`)

| Setting | Default | Purpose |
|---|---|---|
| `enabled` | `true` | Master on/off switch. |
| `baseUrl` | `https://opencode.ai/zen/go/v1` | OpenAI-compatible base URL. |
| `model` | `opencode/minimax-m3` | Model id. Use **OpenCode: List / Choose Model** to discover valid ids. |
| `debounceMs` | `300` | Quiet window after the last keystroke. |
| `maxTokens` | `64` | Suggestion length cap (lower = faster). |
| `temperature` | `0.1` | Sampling temperature. |
| `maxPrefixChars` / `maxSuffixChars` | `2000` / `1000` | Context window sliced around the caret. |

## Commands

- **OpenCode: Set API Key** — store the key in SecretStorage.
- **OpenCode: List / Choose Model** — `GET /models`, pick one into the setting.
- **OpenCode: Toggle Autocomplete** — enable/disable (also the status-bar click).

## Notes

- Per-request latency is logged to the **OpenCode Autocomplete** output channel — use it to compare
  models and tune `model` / `maxTokens`.
- Not bundled (plain `tsc`). For `vsce package`/publishing, add esbuild/webpack bundling so the
  `openai` dependency is packed.
