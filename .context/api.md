---
type: api
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, api, vscode]
---

# Surface

The project's surface is a VS Code extension: an inline-completion provider, commands, settings, and (planned) a webview side panel. It consumes one external API.

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
`enabled` (bool), `baseUrl` (str, default `https://opencode.ai/zen/go/v1`), `model` (str, default `opencode/minimax-m3`), `debounceMs` (300), `maxTokens` (64), `temperature` (0.1), `maxPrefixChars` (2000), `maxSuffixChars` (1000). No `apiKey` setting — key is SecretStorage/env only.

## External API consumed — OpenCode Zen (`go`)
- Base URL: `https://opencode.ai/zen/go/v1`. OpenAI-compatible.
- `POST /chat/completions` — standard OpenAI body; `model` is the bare/​prefixed id. No fill-in-middle route exists.
- `GET /models` — `{ data: [{ id }] }` for discovery.
- Auth: `Authorization: Bearer <key>` (handled by the OpenAI SDK). Nothing else required — no `anthropic-version`, no `x-api-key`, no routing headers.
- Reference implementations studied: the user's `llm-provider` (OpenAI SDK → this exact base URL) and the `codebuff` repo's server handlers (raw fetch, same wire contract).

## Planned — side-panel webview
- Activity-bar view container + a single `type: webview` view `opencodeAutocomplete.panel`.
- `WebviewViewProvider` serves an HTML shell (strict CSP + script nonce) loading the Vite bundle.
- Message protocol — webview→ext: `ready`, `setApiKey`, `clearApiKey`, `selectModel`, `setEnabled`, `refreshModels`; ext→webview: `state{keyIsSet, model, enabled, baseUrl}` (**never the key value**), `models{ids}` / `modelsError`.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
