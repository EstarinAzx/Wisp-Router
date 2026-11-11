---
type: flows
project: wisp
updated: 2026-11-11
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

## TUI Bridge info panel
- **Question:** where is the Bridge panel (OpenAI door / Anthropic door / Access secret / claude-wisp / Advisor heads-up) rendered?  **Lens:** understand
- **Summary:** `/bridge` in the TUI starts (or reuses) the listener, freezes address+secret into mode state, and `App` mounts pure `BridgeScreen` which hardcodes every visible label and only interpolates address/secret/port.
- **Entry:** packages/tui/src/app.tsx:316 (`case 'bridge'`)
- **Key files:** packages/tui/src/app.tsx, packages/tui/src/infoScreens.tsx, packages/tui/src/bridge.ts, packages/tui/src/modes.ts
- **Updated:** 2026-07-18

### Hops
1. packages/tui/src/app.tsx:316-351 — slash `/bridge` ensure-on: `off` stops; if running, re-show screen; else `bridge.start()` then set mode.
2. packages/tui/src/bridge.ts:39-40,31-36 — `bridgeAddress()` / `ensureBridgeSecret()` supply `http://127.0.0.1:<port>` + secret from `~/.wisp` auth.
3. packages/tui/src/modes.ts:41 — mode payload `{ kind:'bridge', address, secret }`.
4. packages/tui/src/app.tsx:526 — `{mode.kind === 'bridge' && <BridgeScreen address secret cols={panelCols} />}`.
5. packages/tui/src/infoScreens.tsx:29-72 — pure JSX: title, ● up · port, door rows, claude-wisp, wisp-slot rec, amber Advisor warning, Esc footer.

## Statusline quota — provider wire → status.json → block
- **Question:** why does the statusline show the anthropic ledger row and no active-provider quota when the session route is an alias to codex?  **Lens:** bug
- **Summary:** The statusline re-implemented route resolution as family-word matching only, so an **aliased** model (`sol`) resolved to no Target — collapsing the route row to bare `wisp`, failing the `status.model === target.model` live test, and demoting the previous Provider's reading to the only visible row. Fixed by mirroring `resolveRoute`'s alias-before-family order.
- **Entry:** plugins/slot/statusline/wisp-statusline.js:115 (route resolution from `config.json`)
- **Key files:** plugins/slot/statusline/wisp-statusline.js, packages/core/src/routing.ts, packages/core/src/status.ts, packages/core/src/bridgeServer.ts, packages/core/src/homeStore.ts
- **Updated:** 2026-07-30

### Hops
1. `packages/core/src/bridgeServer.ts:626-645` — `startProviderStream` pins `modelId = pinnedModel` (the Target's model) and threads `onQuota` into `codexStream`/`anthropicStream` only. `xai`/`antigravity`/keyed arms pass none, so those Providers never report.
2. `packages/core/src/codexClient.ts:75` / `anthropicClient.ts:180` — parse utilization off the **response head** (`parseCodexQuota` / `parseAnthropicQuota`, `status.ts:92,115`), normalized to 0..100 percent.
3. `packages/core/src/bridgeServer.ts:843` — `recordStatus(buildStatus({ provider, model: result.model, usage, meters }))`; `result.model` is the resolved Target model, so `status.model` equals `target.model` exactly.
4. `packages/core/src/homeStore.ts:110` → `status.ts:196` `mergeStatus` — the previous Provider's meters fold into `providers` (24h ledger); the incoming Provider's key is deleted from it (`status.ts:204`), so the ledger never holds the active wire.
5. `plugins/slot/statusline/wisp-statusline.js:115-121` — **the bug**: alias lookup was absent. Now alias-exact → family-fuzzy, mirroring `routing.ts:60-91` (which orders provider-id → alias → family → active).
6. `wisp-statusline.js:126` — `live` = status fresh (<30m) **and** `status.model === target.model`; only then do the ctx field + bar rows render.
7. `wisp-statusline.js:167-188` — everything else demotes: aged-out active snapshot + every `providers` entry, dimmed and age-stamped, max 2 rows.

## Effort — Claude Code `/effort` → each Provider's wire
- **Question:** do the codex, xai, and antigravity Providers use Claude Code's effort levels?  **Lens:** understand
- **Summary:** Claude Code's `/effort` arrives as `output_config.effort`, is validated to Wisp's low→max ladder, and overrides the panel knob for every arm — Codex and Grok fold `max`→`xhigh` and gate the reasoning block per model; Antigravity folds to its own three stops and reaches only the `-tiered` rows, since every other id on that wire pins its depth in the name.
- **Entry:** packages/core/src/bridgeAnthropic.ts:242 (`normalizeEffort(body.output_config?.effort)`)
- **Key files:** packages/core/src/bridgeAnthropic.ts, packages/core/src/bridgeServer.ts, packages/core/src/shared.ts, packages/core/src/codex.ts, packages/core/src/xai.ts, packages/core/src/catalog.ts
- **Updated:** 2026-08-14

### Hops
1. `bridgeAnthropic.ts:72,98,242` — `output_config.effort` is the ONE beta field the door reads; `normalizeEffort` accepts only `low|medium|high|xhigh|max`, anything else → `undefined` (falls back to the panel).
2. `bridgeServer.ts:635` — `const effort = parsed.effort ?? deps.effort()`. Claude Code's value wins over the panel; `bridgeServer.ts:736` logs which one did (`(claude code)` vs `(panel)`).
3. **Codex arm** `bridgeServer.ts:643` → `standardEffortToCodex(effort)` (`shared.ts:63`, folds `max`→`xhigh`) → `codexClient.ts:66` → `codexReasoning` (`codex.ts:177`) emits `{effort, summary:'auto'}` only for `^(gpt-5|o3|o4)`; `*spark*` and gpt-4.x get no reasoning block.
4. **Anthropic arm** `bridgeServer.ts:664` — effort passes through unfolded (`max` is Anthropic-only); the wire clamps per model (`anthropic.ts:214` `modelSupportsAnthropicEffort`, Claude 5 family + Opus/Sonnet 4.5-4.8; Haiku 400s so it is omitted).
5. **xAI arm** `bridgeServer.ts:673` → `xaiClient.ts:50` → `xaiReasoning` (`xai.ts:167`) — same `standardEffortToCodex` fold, gated to `grok-[4-9]`; grok-build/composer reject reasoning and get none. `rewriteXaiResponsesPayload` (`xai.ts:184`) additionally folds a raw-forwarded `minimal`→`low`.
6. **Antigravity arm** `bridgeServer.ts:698` — `standardEffortToAntigravity(effort)` (`shared.ts`, folds `xhigh`/`max`→`high`, because this wire's own client offers exactly three stops) → `antigravityClient.ts` → `buildAntigravityRequestBody` → `applyAntigravityThinkingLevel` runs LAST and emits `request.generationConfig.thinkingConfig = {thinkingLevel, includeThoughts:true}` — but **only for `-tiered` rows** (`antigravityAcceptsThinkingLevel`, a suffix shape test). Every other id pins its depth in the name (`gemini-3.6-flash-low|-medium|-high` are three models), and Wisp lists all 21 flat, so there the user already chose the tier by choosing the row.
7. **Panel ladder** `catalog.ts:522` `effortOptionsFor` — Anthropic offers `low..max`, Grok and everything else `low..xhigh`; Antigravity is never asked (only Codex/Anthropic/Grok call it), so the Antigravity tier rides the Bridge path alone, never a panel control.

## Historical Antigravity discovery (2026-10-14)

Historical observation, preserved from the previous main checkout. Later releases and the native Argon work below supersede its support limits; it grants no new live-probe allowance.

- **Question:** Why does Antigravity CLI show Gemini 4 Argon while Wisp does not? **Lens:** bug
- **Summary:** Wisp's live discovery returned no Argon IDs; its parser preserves the native CLI's three Argon IDs when supplied. Signed Desktop separately admits only Gemini 3.8 Flash.
- **Entry:** packages/tui/src/modelFetch.ts:35 and packages/vscode/src/extension.ts:273
- **Key files:** packages/core/src/antigravityClient.ts, packages/core/src/antigravity.ts, packages/core/src/codexDesktop.ts, packages/tui/src/modelFetch.ts, packages/vscode/src/extension.ts
- **Updated:** 2026-10-14

### Hops and evidence
1. TUI `fetchModelList` and VS Code `antigravityModelIds` prefer live discovery, then use the static fallback on failure/empty results; VS Code additionally times out after four seconds.
2. `antigravityClient.ts:150` sends the stored Wisp token/project to `/v1internal:fetchAvailableModels` using the existing header and host chain. A single default-host diagnostic returned HTTP 200 and 19 parsed IDs, none Argon.
3. `antigravity.ts:1065` filters only `tab_*` and numbered `chat_*` rows. An offline check preserved all three `gemini-4-argon-low|medium|high` IDs returned by native `agy models` on CLI 1.3.4.
4. `codexDesktop.ts:12` admits only `gemini-3.8-flash-tiered`. An offline check confirms all three Argon IDs remain excluded even with instruction hoisting enabled.
- **Limits:** No Argon generation, account-identity comparison, header-version comparison or new adapter qualification. The observations do not prove which upstream entitlement/client difference explains the catalogs.
- **Detailed receipt:** Traycer task `1702a7c7-a431-43c2-ab5f-79d9cf189643`, artifact `release-228-options/argon-discovery/index.md`.


## VS Code Antigravity panel — single model, false key error and missing account controls
- **Question:** Why does the VS Code Antigravity panel show only one model and have no sign-in/sign-out controls while the terminal shows the catalog? **Lens:** bug
- **Summary:** The extension fetches Antigravity modelOptions, but the webview excludes its kind from the branch consuming that list; refresh uses API-key discovery instead, and a separate terminal-only account branch omits both account buttons.
- **Entry:** packages/vscode/webview/app.tsx:205 (provider classification), :225 (picker options), :296 (status-only account UI), :411 (refresh message).
- **Key files:** packages/vscode/webview/app.tsx, packages/vscode/src/sidePanelProvider.ts, packages/vscode/src/extension.ts, packages/tui/src/modelFetch.ts.
- **Updated:** 2026-11-11; inspected source at release2.2.9 / companion1.14.6 and installed extension1.14.6 bundle.
- **Data journey:** extension.ts:277 fetches the OAuth Antigravity list; :447 sends it as modelOptions. app.tsx:205 recognizes only Codex/Claude/Grok for modelOptions; :225 instead uses the empty keyed models list for Antigravity, then :226 prepends the current model. Automatic refresh at :124 requires keyIsSet, which Antigravity normally lacks. Manual refresh passes through sidePanelProvider.ts:166 to extension.ts:260, which only special-cases Gemini API/Codex before calling getClient. keyForProvider at extension.ts:168 has no Antigravity OAuth branch, causing NO_KEY_MESSAGE at :268. The terminal correctly uses antigravityAuth.current plus fetchAntigravityModels at modelFetch.ts:37.
- **Account controls:** app.tsx:210 marks Antigravity/Kimi terminalOauth; :296 renders status and terminal instructions only. PanelHost/onMessage expose no Antigravity account actions even though extension.ts:1007 constructs its auth manager. This is an existing UI integration gap, not evidence of an account/model entitlement restriction.
- **VS Code native chat picker (follow-up screenshot):** chatProvider.ts:116 builds usability flags with OAuth sign-in branches only for Codex, Anthropic and xAI; Antigravity falls through to deps.keyFor, which returns no API key at extension.ts:168. catalog.ts:331 consequently omits its descriptor. extension.ts:1131 registers native chat without Antigravity sign-in/credential dependencies, although the separate Bridge registration at :1092 does supply them. chatProvider.ts has no Antigravity stream adapter either, so exposing a row alone would not provide working chat. This native-chat feature gap is separate from the side-panel picker bug. Argon requires preserved Responses replay state and is explicitly not qualified for VS Code native chat in docs/releases/v2.2.8.md:12; do not broaden that support by merely removing the visibility gate.
- **Limits:** Source/installed-bundle diagnosis only; no real provider call, sign-in/out, credential readback, UI edit or runtime replay performed. Repair and release are not part of this question. Existing Argon surface qualification remains separate from fixing the picker.

## VS Code Codex context label — why GPT-6 Astra shows Max 272K
- **Question:** Why does the Wisp VS Code picker show GPT-6 Astra at272K rather than1M? **Lens:** understand
- **Summary:** Wisp takes context_window from its account catalog metadata and reports that total to VS Code; this path does not consume native Codex's local model_context_window override or promote max_context_window.
- **Entry:** packages/vscode/src/chatProvider.ts:135 loads the account catalog; :141 prioritizes codexModelCaps over models.dev metadata.
- **Key files:** packages/core/src/codexModels.ts:52, packages/core/src/codex.ts:215, packages/core/src/catalog.ts:329, packages/vscode/src/chatProvider.ts:135.
- **Updated:** 2026-11-11; companion1.14.6/source2.2.9 inspection.
- **Evidence:** Local Wisp model cache for gpt-6-astra has contextWindow272000 (clientVersion0.167.1). Native Codex cached metadata separately has context_window272000 and max_context_window872000. Local native config sets model_context_window1000000 and auto_compact900000; Wisp's native-chat descriptor path reads neither setting. Parser deliberately retains context_window only, consistent with the2026-09-06 discovery decision. buildChatModelInfos subtracts output reserve from input so advertised input+output stays equal to the selected total.
- **Official model specification:** https://developers.openai.com/api/docs/models/gpt-6-astra lists1,050,000 context tokens as the API model specification. That is distinct from cached Codex metadata and does not by itself prove this subscription route accepts a1M request.
- **Limits:** No fresh authenticated discovery, generation or long-context acceptance probe; no config/code changes. The observed272K is Wisp's reported descriptor, not proof of a universal VS Code or account hard limit.

## VS Code provider parity implementation (2026-11-11)

- Commit `607d359` repairs the panel path described above: `WispPanelProvider` dispatches Antigravity actions and correlates model replies by provider/request and opaque credential version; `App` consumes host `modelOptions`, handles account pending/errors and discards old-origin results. `getState` captures provider/model configuration before asynchronous discovery. `fetchModelIds` uses refreshed Antigravity OAuth rather than API-key discovery.
- `AntigravityAuth.signIn` guards concurrent flow and verifies the starting account snapshot before the guarded shared-store write. False browser-open results fail immediately and close the callback listener.
- `registerWispChatProvider` receives Antigravity credentials plus model-change events. Its adapter uses `antigravityStream`, strict completion, required tool mode, preserved call IDs/results and cancellation. `nativeChatSupport.ts` supplies the same refusal policy to advertisement, delivery and panel copy. Argon replay remains a separate Bridge Responses contract.
- `parseCodexModels` retains both default and maximum. `codexModelCaps` accepts an optional bounded override. Native chat reads only the machine/user `wisp.codexContextWindows` map, removes public API context as an OAuth fallback, and explains effective/default/maximum/source in its tooltip. Input and output sum to the effective total.
- These are synthetic implementation results, not installed-extension or real-provider acceptance. Current review status is in [[active-work]]; durable behavior details and runnable checks are in `docs/vscode-provider-parity.md`.

## Argon native and Local continuation (2026-11-11 follow-up)

- `nativeChatSupport.ts` accepts exact Argon low/medium/high IDs on VS Code1.145.3+; `chatProvider.ts` routes them to `nativeArgonChat.ts` instead of the generic SSE adapter.
- The adapter decrypts/authenticates original assistant parts before credential refresh or generation, preserves System role3, validates visible history and exact result IDs, then buffers/validates `antigravityNativeResponse` before emitting marker/text/tools/usage. Shared `validateAntigravityFunctionCallPairing` now matches each identified result once; legacy ID-less name matching remains.
- Classic Copilot returns per-assistant encrypted markers. Local's pinned handler supplies a marker-only assistant header followed by instructions and incremental input; `NativeArgonHistory` restores a bounded32-checkpoint/16MiB process-local history after authenticating the marker. Reload/eviction requires a new Local chat. No Bridge start/secret or conversation disk store is needed.
- Source contracts and isolated real `vscode.lm` IPC were tested with synthetic credentials/intercepted fetch. Final core2050, Argon38 and Local scoped review pass at427993c; [[active-work]] owns integration and live-acceptance limits.

## Related

- [[overview]]
- [[active-work]]
