---
type: api
project: wisp
updated: 2026-07-17
tags: [context, api, vscode]
---

# Surface

The project's surface is a VS Code extension: the Inquire command, other commands, a webview side panel, and (since #59) the shared **Wisp home** store `~/.wisp/` (config.json + owner-only auth.json — ADR-0002) that holds all state except the two editor-local tuning settings. It consumes one external API.

## Inquire (the one feature)
- **Slice #5 (2026-06-17) removed Completion**: no `InlineCompletionItemProvider`, no `registerInlineCompletionItemProvider`, no ghost text, no `enabled` toggle. Wisp is **Inquire-only**.
- Inquire is the `wisp.inquire` command (see the table below): instruction from an input box → rewrite the target span (selection, or current line if none) over whole-file context → confirmable `WorkspaceEdit` replace → native refactor-preview accept/reject. Pure cores `buildEditPrompt`/`extractEditText` live in `src/catalog.ts`. See [[decisions]] (2026-06-17).

## Commands
| Command id | Title | What it does |
|---|---|---|
| `wisp.setApiKey` | Wisp: Set API Key | Prompt + store key in `~/.wisp/auth.json` (`keys.<keyId>`); invalidate cached client. |
| `wisp.listModels` | Wisp: List / Choose Model | `GET /models` → quick-pick → write the Provider's model into config.json `models`. |
| `wisp.inquire` | Wisp: Inquire | **Inline-chat edit (slice #4).** `showInputBox` instruction → target span = selection (or current line if none), whole file = context → `buildEditPrompt` → blocks/diff. **Branches on the Active Provider's `kind`:** `codex` → `codexClient.codexInquire` (Responses API, sign-in required); else → the OpenAI SDK chat-completions client. Cancellable `withProgress`. Keybinding **`Ctrl+Shift+I`**. In the `editor/context` menu + palette. |
| `wisp.codexSignIn` | Wisp: Sign in to Codex | Run the ChatGPT-account OAuth flow (`CodexAuth.signIn`), store tokens in auth.json `codex`, refresh the panel. |
| `wisp.codexSignOut` | Wisp: Sign out of Codex | Tombstone the Codex token slot (empty `{}`, not delete — so `~/.codex/auth.json` isn't re-imported; see [[gotchas]]) + refresh the panel. |
| `wisp.bridgeToggle` | Wisp: Toggle Bridge | Start the listener if stopped, stop it if running — via the **shared** `startBridge`/`stopBridge` (#38) the panel switch also drives (no fork). Start generates/loads the access secret, binds the port, and injects the `COPILOT_*` env vars; stop closes the port + wipes the in-mem secret + clears the env. Pushes panel state after either. |

## Settings — split across VS Code and `~/.wisp/config.json` (#59)
VS Code `wisp.*` keeps only editor-local tuning: `maxTokens` (0 = uncapped) and `temperature` (0.1). Everything else lives in **`~/.wisp/config.json`** (hand-editable, watched): `provider` (Active Provider id; unknown → falls back to `opencode-go`; outside any workspace's reach, which replaces the old machine-scope defense), `models` (`{providerId: model}` memory), `effort`, `routing` (the Routing map), `customBaseUrl` (used **only** by the `custom` row; built-ins use their hardcoded catalog URL), `bridge.port` (default `41184`) and `bridge.aliasPickerShowsModel` (default `true`). No `apiKey` anywhere in settings — keys are auth.json/env only. The old `wisp.provider`/`baseUrl`/`model`/`bridge.*` settings contributions were **removed**; a first launch seeds config.json from their **user-scope** values (`inspect().globalValue` — a workspace value must not choose where the key goes) + old globalState, then retires the globalState keys.

### Provider catalog (multi-provider, Issues 4–7; Zen/Go split #12; Codex #13)
- `PROVIDERS` is a code constant in `src/extension.ts`: 11 built-in rows `{id,label,baseUrl,defaultModel,apiKeyEnv,catalogKey?,keyId?,kind?}` (base URLs **hardcoded**, never from settings) + a `custom` row whose base URL is the user-supplied machine-scoped `wisp.baseUrl`. The **Active Provider** (`activeProvider()`) is the source of truth; an unknown `wisp.provider` falls back to row 0 (**`opencode-go`**, default). **OpenCode Go** (`/zen/go/v1`, budget) and **OpenCode Zen** (`/zen/v1`, premium Claude/GPT/Gemini) are two endpoints of one account.
- **Provider `kind`** (`'openai-chat'` default, or `'codex'`): the ten API-key rows are openai-chat; the **`codex`** row (`kind:'codex'`, baseUrl `https://chatgpt.com/backend-api/codex`, default `gpt-5.3-codex`, no `apiKeyEnv`) is reached by OAuth, not a key. Inquire + the "usable" test + the panel branch on it. Codex is **usable when signed in** (`isCodexSignedIn`), has **no API-key field**, and offers a curated model dropdown (`CODEX_MODELS` — no `/models` route). It is **not** advertised in the native chat picker yet (keyless → hidden; #14).
- **Per-Provider key:** auth.json `keys[keyId ?? id]` → the row's env var (`apiKeyEnv`: `OPENCODE_API_KEY`/`OPENAI_API_KEY`/`GROQ_API_KEY`/`MISTRAL_API_KEY`/`OPENROUTER_API_KEY`/`OLLAMA_API_KEY`/`KILOCODE_API_KEY`/`CLINE_API_KEY`; local-`ollama` + `custom` have none) → none. **`keyId`** lets a row borrow a sibling's entry: `opencode-zen` sets `keyId: 'opencode-go'`, so both OpenCode endpoints share one stored key (`resolveKeyId` routes every get/store/delete/display). A keyless row is hidden from the chat picker — see [[gotchas]].
- **Per-Provider model memory:** config.json `models` (`{providerId: model}`) → row `defaultModel`. The old `wisp.model` settings mirror is gone. **No model-id transform** — each `defaultModel` is the Provider's native (bare) form.
- **Client** (`getClient`) is built from the active row's resolved `{baseUrl, key}` (`activeBaseUrl()`) and rebuilt when the Active Provider, its key, or its model changes.
- **Three silent one-time migrations, run in order on activate:** (1) `migrateZenToGo` — moves any key + remembered model from the old `opencode-zen` slot to **`opencode-go`** and **deletes** the old zen slot (it held a Go key; leaving it would 401 the new `/zen/v1` row); (2) `migrateLegacyKey` — pre-catalog `wisp.apiKey` → `wisp.apiKey.opencode-go` (+ `wisp.model` → Go's globalState record), then deletes the legacy slot; (3) `migrateToWispHome` (#59) — seeds config.json (only while absent) from user-scope settings + globalState, then **copies** every SecretStorage slot into auth.json (never clobbering) and **deletes** the slots, so a second launch finds nothing. Pure planners `planZenToGoMigration`/`planLegacyMigration` in `catalog.ts`, `planSecretsMigration`/`seedConfigFromVsCode` in `home.ts`.
- ⚠ `ollama`/`ollama-cloud`/`kilocode`/`cline` `defaultModel`s are **best-effort presets** — not yet verified against each `GET /models` (no keys at build); the panel model picker is the correction path.

## The Bridge — outward OpenAI-compatible endpoint (PRD #34; listener #37)
Wisp's first **inbound** network listener — the outward mirror of the LM Chat Provider. `src/bridgeServer.ts`
(`createBridgeServer(deps)` → `{ start, stop, isRunning, dispose }`) is impure glue over the pure `src/bridge.ts`
translator; node `http` stdlib, no web framework. OFF by default — started/stopped by both `wisp.bridgeToggle`
**and** the side-panel switch, through the shared `startBridge`/`stopBridge` in `extension.ts` (#38). Binds
**`127.0.0.1`** on `wisp.bridge.port`. The deps seam mirrors `chatProvider.ts`'s `ChatProviderDeps` (providers +
model-map/baseUrl getters + async `keyFor`/`clientFor`); `extension.ts` owns secrets.
- **Auth:** every request needs the access secret via `Authorization: Bearer` **or** `x-api-key` (#44 — Claude
  Code sends whichever matches the env var used; constant-time compare); mismatch → **401**.
  The secret is **auto-generated** (`randomBytes(32)` base64url, #38), stored in auth.json
  **`bridgeSecret`** once and reused, surfaced in the panel with Copy, and held in a module var only while
  running (`accessSecret: () => bridgeSecret`, `''` when stopped — the auth check is synchronous).
- **Copilot CLI wiring (#35/#38):** while running, `injectCopilotEnv()` sets five `COPILOT_*` vars on
  `context.environmentVariableCollection` so any integrated terminal opened **after** Start points at the Bridge —
  `COPILOT_PROVIDER_BASE_URL=http://127.0.0.1:<port>/v1`, `COPILOT_MODEL=`the active Provider's **resolved model
  name** (`activeModel()`, not its id — so Copilot CLI's UI shows the real model; #b), re-synced on a mid-run
  Provider **or** model switch, `COPILOT_PROVIDER_API_KEY=`the access secret, `COPILOT_PROVIDER_TYPE=openai`,
  `COPILOT_OFFLINE=true`. Cleared on stop **and on activate** (the collection is `.persistent` by default, Bridge
  starts OFF). Existing terminals stay stale until relaunched (the label is a launch-time snapshot) — see [[gotchas]].
- **`POST /v1/chat/completions`:** `parseOpenAiChatRequest` (untrusted body → **400** on bad JSON or no turns) →
  route the `model` field. **Routing (#51, both doors):** `resolveRoute` (`src/routing.ts`, pure + fully
  unit-tested) — **Provider id → Alias exact → Family fuzzy (`claude-*` ids containing opus/sonnet/haiku/fable)
  → Active Provider fallback**. An Alias/Family hit carries a **pinned model** that beats `resolveModel` for
  that request only; a Target naming a missing Provider → **404** (fail-loud, never silent fallback). The map
  (`RoutingMap` in config.json `routing`) + panel model are read **live per request** — a
  panel or `wisp routing set|unset` edit applies to the next call, no relaunch. The CLI uses the same pure map operations, splits a Target on the first `/`, writes accepted edits atomically through `WispHome`, refuses invalid edits without writing, and emits a `warning:` while still writing when credentials are absent. One log line per routed request:
  `[bridge] route <kind> '<name>' -> <provider> model=<pinned>`. Then by Provider kind:
  - **keyed** (openai-chat) → OpenAI SDK `chat.completions.create` (`stream:true`, system re-prepended).
  - **`codex`** (#39) → `handleCodexChat`: `codexStream` (Responses SSE) on `codexAuth.current()` creds +
    `standardEffortToCodex(effort)` + `toCodexResponsesTools`, `parsed.system` re-attached as a leading
    `role:'system'` message (→ `instructions`). No creds → **401**; stream throw → **502**.
  - **`anthropic`** (#40) → `handleAnthropicChat`: `anthropicStream` (Messages SSE) on `anthropicAuth.current()`
    creds + **raw** `effort` (the body builder maps it via `anthropicThinkingEffort`) + `toAnthropicTools`,
    `parsed.system` re-attached as a leading `role:'system'` message (body builder lifts it to top-level
    `system`); images dropped. No creds → **401**; stream throw → **502**.
  Every path renders back through `bridge.ts`'s SSE emitters, OR one aggregated `chat.completion` object when
  the client sent `stream:false`. Tool calls assembled whole. Codex + Anthropic reuse the **same wire shape**
  (`textChunk`/`toolCallChunk`/`finalChunk`) as the keyed path, not a second renderer.
- **`GET /v1/models`:** `buildModelsList(buildChatModelInfos(...), aliasNames)` — the usable Provider ids
  (`{id, object:'model', created:0, owned_by:'wisp'}`): keyed = has a key, **`codex` = signed in** (#39),
  **`anthropic` = signed in** (#40); Routing-map **Alias names appended raw** after the ids (#52, read live
  per request). **Family routes never listed** on either door.
- **Anthropic door (#45 translator + #46 wiring, LIVE):** requests carrying `anthropic-version` or `x-api-key`
  get the Anthropic dialect (`isAnthropicFlavored`). `POST /v1/messages` (exact path only — `count_tokens` 404s)
  → `parseAnthropicMessagesRequest` (`bridgeAnthropic.ts`: flatten `system` array + mid-messages `role:"system"`,
  strip the `claude-wisp-` alias, map tool_use/tool_result/image blocks, carry forced `tool_choice` +
  `temperature`, read `output_config.effort` — Claude Code's `/effort`, ladder-validated; other beta fields
  ignored) → routed via the same `resolveRoute` Routing map as the OpenAI door (post-alias-strip, so
  `claude-wisp-<id>` still hits Provider id and the background tier's stock `claude-*` ids hit Family rows),
  then `startProviderStream` (all three Provider kinds, pinned model threaded) → reply as **Anthropic SSE**
  via `createAnthropicSseEncoder`. SSE-only
  (Claude Code always streams). **Effort: `parsed.effort ?? panel effort`** — Claude Code's pick wins when
  present (`max` folds to `xhigh` on Codex); one log line per call names which won. A mid-stream backend
  failure writes an Anthropic `error` event, not a truncated
  stream. **Codex tools go `strict:false` on this path** (external toolset — Codex strict mode rejects Claude
  Code's dynamic-map schemas like `AskUserQuestion`). `GET /v1/models` → `buildAnthropicModelsList` (`claude-wisp-<id>`
  aliases + Provider label as `display_name`; **no effort suffix** — Bridge lists thread no effort, only the
  in-VS-Code picker label carries "· <effort>"). Routing-map Aliases follow the Providers, also
  `claude-wisp-` prefixed so a picked entry round-trips through the inbound strip to the alias route (#52);
  their `display_name` carries the pinned model (`sol — gpt-5`) unless config.json `bridge.aliasPickerShowsModel`
  is off (default on; Claude Code refetches the list only on restart). Verified live vs real Claude Code: Codex OAuth **and** keyed
  (OpenCode Go) both stream + complete a tool round-trip (file write); `/effort` max/xhigh/high reach the backend.
- **Not unit-tested** (glue → F5/manual per PRD); the genuinely-new logic is the unit-tested `bridge.ts` +
  `codexStream`. See [[decisions]] 2026-06-24 (#39 Codex send-path) and the PowerShell test trap in [[gotchas]].

## External API consumed — OpenCode (`go` + `zen`)
- Two endpoints of the same OpenCode account (one Bearer key): **Go** `https://opencode.ai/zen/go/v1` (budget) and **Zen** `https://opencode.ai/zen/v1` (premium). Both OpenAI-compatible.
- `POST /chat/completions` — standard OpenAI body; `model` must be the **bare** id (`minimax-m3` on Go; `claude-opus-4-8`/`gpt-5.5`/… on Zen) — the `opencode/`-prefixed form returns `401 … not supported`. No fill-in-middle route exists.
- `GET /models` — `{ data: [{ id }] }` for discovery; **public** (no auth) on both, returns bare ids. The panel auto-fetches it once a key is set. Go served 18 ids as of 2026-06-10 (minimax/kimi/glm/deepseek/qwen/mimo + `hy3-preview`); Zen serves the **premium** set (Claude/GPT/Gemini families) as of 2026-06-18.
- Auth: `Authorization: Bearer <key>` (handled by the OpenAI SDK). Nothing else required — no `anthropic-version`, no `x-api-key`, no routing headers.
- Reference implementations studied: the user's `llm-provider` (OpenAI SDK → this exact base URL) and the `codebuff` repo's server handlers (raw fetch, same wire contract).

## External API consumed — Codex (ChatGPT subscription, slice #13)
- **OAuth** (`codexAuth.ts`): the published Codex-CLI app — `client_id app_EMoamEEZ73f0CkXaXp7hrann`, issuer `https://auth.openai.com`, PKCE S256, loopback redirect `http://localhost:1455/auth/callback` (ephemeral-port fallback if busy), scope `openid profile email offline_access api.connectors.read api.connectors.invoke`, originator `codex_cli_rs`. Code→token at `/oauth/token`; refresh (grant `refresh_token`) at `exp − 60s`, re-reading auth.json first (two-process rotation safety, #59). Tokens (`{accessToken,refreshToken,idToken,accountId}`) in `~/.wisp/auth.json` **`codex`**; `~/.codex/auth.json` (or `$CODEX_HOME`) imported on first use.
- **Inference** (`codexClient.ts`): `POST https://chatgpt.com/backend-api/codex/responses` — the OpenAI **Responses** API (not chat-completions), **SSE**. Body: `{ model, instructions?, input:[{type:'message',role,content:[{type:'input_text',text}]}], reasoning?, store:false, stream:true }` (reasoning sent for gpt-5/o, omitted for gpt-4.x/spark). Headers: `Authorization: Bearer <access_token>` (the subscription bearer, **not** the exchanged apiKey), `chatgpt-account-id` (required), `originator: codex_cli_rs`, `OpenAI-Beta: responses=experimental`, `session_id`, `Accept: text/event-stream`. Reply: `response.output_text.delta` (`data.delta`) fragments + a terminal `response.completed`/`incomplete` (`data.response.output[].content[].output_text`); `response.failed` → throw `data.response.error.message`. Reduced to text by `reduceResponsesTextEvents`. **No `/models` route.** See [[gotchas]] for the live request contract (dead `gpt-5-codex`, reasoning-required).

## Side-panel webview
- Activity-bar view container `wisp` (icon `media/wisp.svg`) + a single `type: webview` view `wisp.panel`. Registered with `registerWebviewViewProvider` in `src/extension.ts`; provider is `WispPanelProvider` in `src/sidePanelProvider.ts`.
- The provider serves an HTML shell (strict CSP + script nonce, `asWebviewUri` for assets) loading the Vite bundle (`dist/webview/main.js` + `main.css`).
- The panel calls the same shared actions as the commands (`storeApiKey`/`clearApiKey`/`fetchModelIds`/`setModel`/`setProvider`/`setBaseUrl`/`getState`), injected as a `PanelHost` — panel and commands never drift.

### Message protocol
- **webview → ext:** `ready` · `setApiKey{value}` · `clearApiKey` · `selectModel{value}` · `selectProvider{value}` · `setBaseUrl{value}` · `refreshModels` · `codexSignIn` · `codexSignOut` · `selectEffort{value}` · `bridgeToggle` · `copyBridgeSecret` · `copyBridgeAddress` · `copyClaudeSnippet{value: 'powershell'|'bash'|'settingsJson'}` (#38/#47 — toggle drives the shared start/stop; copies are done host-side via `vscode.env.clipboard`, the snippet rebuilt from host-owned values) · `setFamilyRoute{value:{family,providerId,model}}` (#51 — both halves present → Target stored, else row explicitly unmapped; host validates providerId against the catalog) · `setAlias{value:{name,providerId,model}}` + `removeAlias{value:{name}}` (#52 — upsert by exact name / remove; host refuses a name colliding with a Provider id and a dangling Target, the webview shows the visible collision message) · `setAliasPickerShowsModel{value:boolean}` (#52 — writes config.json `bridge.aliasPickerShowsModel`; the explicit state push confirms) · `fetchProviderModels{value: providerId}` (#53 — any catalog Provider's model ids for the Routing-map row dropdowns; host answers `providerModels`, empty ids on ANY failure — no error message by design).
- **ext → webview:** `state{state}` where `state = {keyIsSet, keySource: 'stored'|'env'|'none', keyEnv, model, baseUrl, providerId, providers: {id,label}[], isCustom, kind?, signedIn?, modelOptions?, effort?, effortOptions?, bridgeRunning, bridgeAddress, bridgeSecret?, claudeSnippets?, routingFamilies?, routingAliases?, aliasPickerShowsModel?}` · `models{ids}` · `modelsError{message}` · `providerModels{providerId, ids}` (#53 — a Routing-map row's list; `[]` = unavailable → the row falls back to free text) · `activity{thinking}`. For a `codex` Provider the panel shows sign-in/out (driven by `signedIn`) instead of the key field, and the model dropdown uses `modelOptions` (the curated `CODEX_MODELS`) since there's no live `/models` fetch. The **Bridge** section (#38) shows a running/stopped dot + Start/Stop, and while running the address + secret (`bridgeSecret` present only then) with Copy buttons, plus a **Routing map** sub-section (#51/#52): four always-visible Family rows (Opus/Sonnet/Haiku/Fable), each a Provider dropdown ("Unmapped" default) + a pinned-model field that is a real dropdown when the row Provider's list is known (#53: models.dev for OAuth kinds, live `/models` with that Provider's own key for keyed kinds; cached per Provider per panel session, dropped when key presence flips) and free text otherwise, drafts local to the webview (seeded once from the first `state` push so a half-typed row survives pushes); below them the saved Alias rows (read-only, ✕ removes) + one draft add-row (name + Provider + model, Add disabled and a visible message on a Provider-id collision) + the alias-picker model-suffix checkbox, plus a **Claude Code** sub-section (#47): three copy-paste setup variants (`claudeSnippets` = PowerShell/bash session lines + project `.claude/settings.json` env block, present only while running; built by `buildClaudeCodeSnippets`), a Bridge-off explainer otherwise. No global `~/.claude/settings.json` variant — banned (PRD #43).
- **Key is write-only across the boundary** — the value is never sent back (only presence + source), and error text is `sanitizeError`'d so a server 401 body can't leak key fragments. See [[gotchas]].
- State is pushed on `ready`, explicitly after every mutation helper (store writes fire no VS Code event), and on the `~/.wisp` **fs watcher** (covers other windows' writes, hand edits, and the future TUI — replaced `onDidChangeConfiguration` + `secrets.onDidChange` in #59).
- **Activity** (`activity{thinking}`) is the live Thinking/Idle signal, pushed separately from `state` on every in-flight transition (`enter/exitInFlight`) **and** on `ready` (via `PanelHost.getActivity`), so it never drags the async `getState`/model-refetch path. The panel renders it as a top status row (pulse dot); the status bar shows the same Activity as `ready`/`thinking`/`error`. See [[decisions]].

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
