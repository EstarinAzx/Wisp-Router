---
type: api
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, api, vscode]
---

# Surface

The project's surface is a VS Code extension: an inline-completion provider, commands, settings, and a webview side panel. It consumes one external API.

## Inline completion provider
- Registered for all files (`{ pattern: '**' }`) via `registerInlineCompletionItemProvider` in `src/extension.ts`.
- Behavior: debounced (cancellation-token based), gated, single-entry cached, non-streaming chat request → cleaned insertion at the caret. See [[decisions]] and [[gotchas]].

## Commands
| Command id | Title | What it does |
|---|---|---|
| `opencodeAutocomplete.setApiKey` | OpenCode: Set API Key | Prompt + store key in SecretStorage; invalidate cached client. |
| `opencodeAutocomplete.listModels` | OpenCode: List / Choose Model | `GET /models` → quick-pick → write `model` setting. |
| `opencodeAutocomplete.toggle` | OpenCode: Toggle Autocomplete | Flip `enabled`; also the status-bar click action. |

## Settings (`opencodeAutocomplete.*`)
`enabled` (bool), `baseUrl` (str, default `https://opencode.ai/zen/go/v1`, **`scope: machine`** — not workspace-overridable, blocks key-redirect), `model` (str, default **bare** `minimax-m3` — the prefixed form is rejected, see [[gotchas]]), `debounceMs` (300), `maxTokens` (64), `temperature` (0.1), `maxPrefixChars` (2000), `maxSuffixChars` (1000). No `apiKey` setting — key is SecretStorage/env only. Panel and commands write `model`/`enabled` to the scope that already defines the value (`targetFor()`), not blindly Global.

## External API consumed — OpenCode Zen (`go`)
- Base URL: `https://opencode.ai/zen/go/v1`. OpenAI-compatible.
- `POST /chat/completions` — standard OpenAI body; `model` must be the **bare** id (`minimax-m3`) — the `opencode/`-prefixed form returns `401 … not supported`. No fill-in-middle route exists.
- `GET /models` — `{ data: [{ id }] }` for discovery; **public** (no auth) and returns bare ids. The panel auto-fetches it once a key is set. As of 2026-06-10 it serves 18 ids (minimax/kimi/glm/deepseek/qwen/mimo families + `hy3-preview`).
- Auth: `Authorization: Bearer <key>` (handled by the OpenAI SDK). Nothing else required — no `anthropic-version`, no `x-api-key`, no routing headers.
- Reference implementations studied: the user's `llm-provider` (OpenAI SDK → this exact base URL) and the `codebuff` repo's server handlers (raw fetch, same wire contract).

## Side-panel webview
- Activity-bar view container `opencodeAutocomplete` (icon `media/opencode.svg`) + a single `type: webview` view `opencodeAutocomplete.panel`. Registered with `registerWebviewViewProvider` in `src/extension.ts`; provider is `OpenCodePanelProvider` in `src/sidePanelProvider.ts`.
- The provider serves an HTML shell (strict CSP + script nonce, `asWebviewUri` for assets) loading the Vite bundle (`dist/webview/main.js` + `main.css`).
- The panel calls the same shared actions as the commands (`storeApiKey`/`clearApiKey`/`fetchModelIds`/`setModel`/`setEnabled`/`getState`), injected as a `PanelHost` — panel and commands never drift.

### Message protocol
- **webview → ext:** `ready` · `setApiKey{value}` · `clearApiKey` · `selectModel{value}` · `setEnabled{value}` · `refreshModels`.
- **ext → webview:** `state{state}` where `state = {keyIsSet, keySource: 'stored'|'env'|'none', model, enabled, baseUrl}` · `models{ids}` · `modelsError{message}` · `activity{thinking}`.
- **Key is write-only across the boundary** — the value is never sent back (only presence + source), and error text is `sanitizeError`'d so a server 401 body can't leak key fragments. See [[gotchas]].
- State is pushed on `ready`, on `onDidChangeConfiguration` (any `opencodeAutocomplete.*`), and on `secrets.onDidChange` (covers this window's key writes and changes from other windows).
- **Activity** (`activity{thinking}`) is the live Thinking/Idle signal, pushed separately from `state` on every in-flight transition (`enter/exitInFlight`) **and** on `ready` (via `PanelHost.getActivity`), so it never drags the async `getState`/model-refetch path. The panel renders it as a top status row (pulse dot, muted when disabled); the status bar shows the same Activity as `ready`/`thinking`. See [[decisions]].

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
