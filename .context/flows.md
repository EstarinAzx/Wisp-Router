---
type: flows
project: wisp
updated: 2026-07-16
tags: [flows]
---
# Flows

## Happy path — native chat model routing
- **Question:** whats the happy path of this codebase  **Lens:** understand
- **Summary:** Wisp registers as a VS Code Language Model Chat Provider on startup, advertises one model per signed-in/keyed backend, and when the user picks a Wisp model in Copilot chat it routes the turn to that backend's client (Codex Responses / Anthropic Messages / OpenAI-compatible chat-completions) and streams text + tool calls back.
- **Entry:** src/extension.ts:740 (`registerWispChatProvider({...})` inside `activate`)
- **Key files:** src/extension.ts, src/chatProvider.ts, src/catalog.ts, src/codexClient.ts, src/anthropicClient.ts
- **Updated:** 2026-06-23

### Hops
1. src/extension.ts:678 `activate()` — extension entry (activationEvent `onStartupFinished`); builds auth, status bar, panel.
2. src/extension.ts:740 → src/chatProvider.ts:253 `registerWispChatProvider()` → `vscode.lm.registerLanguageModelChatProvider('wisp', ...)` (matches `contributes.languageModelChatProviders` vendor `wisp` in package.json).
3. src/chatProvider.ts:109 `provideLanguageModelChatInformation()` — advertises one model per usable Provider (keyed OR OAuth-signed-in), caps pulled from models.dev with a 4s timeout race (src/modelsDev.ts), shaped by `buildChatModelInfos` (catalog).
4. User picks a Wisp model + types → src/chatProvider.ts:146 `provideLanguageModelChatResponse()` — finds the Provider by `model.id`, resolves model id, wires cancellation→AbortController.
5. Route by Provider kind:
   - Codex → src/chatProvider.ts:164 `codexStream()` (src/codexClient.ts:111) — Responses API.
   - Anthropic → src/chatProvider.ts:189 `anthropicStream()` (src/anthropicClient.ts:99) — Messages API.
   - everything else → src/chatProvider.ts:212 `client.chat.completions.create({stream:true})` — OpenAI-compatible.
6. Stream relayed: text deltas → `LanguageModelTextPart`; tool-call fragments reassembled (`assembleToolCalls`) → `LanguageModelToolCallPart`, reported via `progress` to VS Code chat UI.

### Secondary flow — Inquire (Ctrl+Shift+I inline edit)
- src/extension.ts:547 `inquire()` → builds SEARCH/REPLACE edit prompt (src/catalog.ts:102 `buildEditPrompt`) → backend call (codexInquire / anthropicInquire / OpenAI chat) → `applyEditBlocks` (src/catalog.ts:145) → inline diff preview with accept/reject CodeLenses.

### Note
- Folder is named `autocomplete_extension` but product is **Wisp** — a BYOK model router for Copilot. There is **no** inline-completion provider (no `registerInlineCompletionItemProvider`). "Autocomplete" is a misnomer for this repo.

## Anthropic auth — Claude.ai OAuth sign-in
- **Question:** the anthopic auth  **Lens:** understand
- **Summary:** Claude sign-in opens a PKCE Claude.ai OAuth URL, catches the loopback callback, exchanges the code for subscription tokens, stores them in SecretStorage, and refreshes the access token within five minutes of expiry before chat/Inquire use it.
- **Entry:** src/extension.ts:865 (`wisp.anthropicSignIn` command)
- **Key files:** src/extension.ts, packages/core/src/anthropicAuth.ts, src/catalog.ts, src/sidePanelProvider.ts, webview/app.tsx, src/anthropicClient.ts, src/chatProvider.ts
- **Updated:** 2026-07-06

### Hops
1. package.json:71 and package.json:75 expose `Wisp: Sign in/out of Claude`; src/extension.ts:865-866 register those commands to `anthropicSignIn` / `anthropicSignOut`.
2. webview/app.tsx:127-132 detects `kind:'anthropic-oauth'` and posts `anthropicSignIn` / `anthropicSignOut`; src/sidePanelProvider.ts:155-159 forwards those messages to the extension host.
3. src/extension.ts:532-545 wraps sign-in/out with user toasts and panel refresh; src/extension.ts:793 constructs the singleton `AnthropicAuth` with `SecretStorage`, `openExternal`, and output logging.
4. packages/core/src/anthropicAuth.ts:192-195 calls `runAnthropicOAuth`, then stores the returned bundle in `wisp.anthropicAuth`; packages/core/src/anthropicAuth.ts:200 signs out by storing `{}`.
5. packages/core/src/anthropicAuth.ts:132-145 creates a PKCE verifier/challenge + state, starts a localhost callback server, opens the Claude authorize URL, waits up to five minutes for the callback, then exchanges the code.
6. packages/core/src/anthropicAuth.ts:54-67 builds the authorize URL with Claude Code's public client id, scope, loopback redirect, S256 challenge, and state.
7. packages/core/src/anthropicAuth.ts:105-126 listens on `/callback`, extracts `code`, verifies `state`, renders success HTML, and resolves the one-shot code promise.
8. packages/core/src/anthropicAuth.ts:70-90 posts the authorization code, verifier, redirect URI, client id, and state to `https://platform.claude.com/v1/oauth/token`; src/catalog.ts:828-836 converts the token JSON into `{accessToken, refreshToken, expiresAt}`.
9. packages/core/src/anthropicAuth.ts:203-206 reads stored creds when callers need them and refreshes if needed; packages/core/src/anthropicAuth.ts:169-188 refreshes near expiry, keeps the old refresh token if the response omits one, and logs but keeps old creds on refresh failure.
10. src/extension.ts:319-326 and src/chatProvider.ts:109-116 use `isSignedIn()` for UI/model availability; src/extension.ts:680-682, src/chatProvider.ts:185-191, and src/anthropicClient.ts:52-75 use `current()` creds for Inquire/native chat Messages requests.

## Routing CLI snapshot — live map to terminal
- **Question:** How does `wisp routing` expose the current Routing map?  **Lens:** understand
- **Summary:** The `wisp` entry lazily dispatches `routing` before renderer imports, TUI glue reads the live Wisp home config, and pure core logic formats all fixed family rows or serializes the stored map directly as JSON.
- **Entry:** packages/tui/src/index.tsx:18
- **Key files:** packages/tui/src/index.tsx, packages/tui/src/routingCli.ts, packages/core/src/routingCli.ts, packages/core/src/routing.ts
- **Updated:** 2026-07-16

### Hops
1. `packages/tui/src/index.tsx:18` matches the `routing` argv word and lazily imports `runRoutingCli` before any OpenTUI import.
2. `packages/tui/src/routingCli.ts:16` reads `home.readConfig().routing`, defaults to `EMPTY_ROUTING_MAP`, and passes argv + map to core.
3. `packages/core/src/routingCli.ts:21` accepts only show or `--json`; text iterates shared `FAMILY_KEYS`, while JSON calls `JSON.stringify` on the current map itself.
4. `packages/tui/src/routingCli.ts:19` prints returned lines and hands the exit code back to the process.

## Related

- [[overview]]
- [[active-work]]
