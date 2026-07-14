---
type: gotchas
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Gotchas

### opentui: selects are invisible without an explicit height, and bare exit strands the terminal
Three opentui 0.4.3 traps (probe-verified, not in docs). **1)** `<select>` renders **zero rows**
unless given an explicit `height` — the wrapping box auto-sizes around an empty list and the
picker looks broken (an option is **2 rows** while `showDescription` is on). **2)** a bare
`process.exit()` skips opentui's teardown (no `beforeExit` on explicit exit) and leaves the
terminal in raw mode / the alternate screen — every TUI exit path must `renderer.destroy()`
first (`exitTui()` in `packages/tui/src/app.tsx`). **3)** **border titles silently drop
non-ASCII** — a `title` containing an em-dash/`·` renders as no title at all (the #62 /test
screenshot), while the same characters render fine in body `<text>`. Keep border titles
plain ASCII (screenshot-confirmed on the #63 /bridge screen; /test's title fixed in `f2efe18`).

### No fill-in-middle (FIM) on the Zen endpoint
The provider exposes **only** OpenAI-compatible chat completions — there is no FIM/`suffix` route. Inquire prompts a *chat* model to rewrite a span (whole-file context → return only the replacement code). Don't go looking for a FIM endpoint to "do it properly"; it doesn't exist. This is also why latency is ~0.5–1.5s, not sub-100ms.

### Webview CSP × Tailwind v4
With a Vite **production** build, Tailwind compiles to a static linked stylesheet — no runtime `<style>` injection — so a strict CSP (`script-src 'nonce-…'; style-src ${cspSource}`) is enough. Only add `'unsafe-inline'` to `style-src` if the webview devtools console actually reports a violation. Don't pre-emptively loosen it.

### Two TypeScript configs must stay separate
The extension `tsconfig.json` keeps `include: ["src"]`. The webview's JSX lives under `webview/` with its **own** tsconfig (`jsx: react-jsx`, `jsxImportSource: preact`). If the extension `tsc` ever picks up the webview files it will fail on browser JSX/DOM types. `compile` runs both (`tsc -p ./ && tsc -p webview && vite build`) — Vite's esbuild transform does **not** type-check, so without the `tsc -p webview` step webview type errors ship silently.

### Vite asset names must be deterministic
The extension references the webview bundle by fixed path (`main.js` / `main.css`). The Vite config must disable hashing (`entryFileNames`/`assetFileNames` pinned, `cssCodeSplit:false`, `inlineDynamicImports:true`). Default hashed names will 404 in the webview.

### Config writes must target the defining scope, not always Global
`setModel`/`setProvider`/`setBaseUrl` use `cfg().inspect()` (via `targetFor()`) to write the scope that already defines the value. A blind `ConfigurationTarget.Global` write under a workspace override is silently ineffective and the controlled panel select snaps back. See `targetFor()` in `src/extension.ts`.

### Server error bodies can leak the key — sanitize before posting to the webview
`fetchModelIds` failures must not forward raw `String(err)` to the panel: OpenAI-style 401 bodies echo key fragments (`Incorrect API key provided: sk-…`). `sanitizeError` in `src/sidePanelProvider.ts` maps to a status-code string. The write-only-key rule covers error text too.

### Key is write-only across the webview boundary
Never post the API key value back to the webview — only a `keyIsSet` boolean. Invalidate the cached OpenAI client whenever the key is set or cleared.

### Model ids are BARE on `zen/go/v1` — the `opencode/` prefix is rejected
The chat endpoint returns `401 Model opencode/minimax-m3 is not supported` for a provider-prefixed id. Use the **bare** id exactly as `GET /models` serves it (`minimax-m3`, `glm-5`, `kimi-k2.6`, …). `DEFAULT_MODEL`, the setting default, and `fetchModelIds` must all stay bare. The `opencode/<id>` form (from the reference `llm-provider` and the public docs) does **not** work against this gateway — it had inline completions silently erroring the whole time. The sibling **`/zen/v1`** (OpenCode Zen, added in #12) also serves **bare** ids (verified 2026-06-18 against its public `GET /zen/v1/models`) — but a **different, premium** model set (Claude/GPT/Gemini), not Go's budget ids. See [[decisions]].

### A shared-credential Provider must set `keyId` or it's hidden from the chat picker
`buildChatModelInfos` only advertises **keyed** Providers (a keyless row would be a dead pick). So a new
row that shares another row's credential is **invisible** until it has its own key — even though the
credential already exists. **OpenCode Go + OpenCode Zen are one OpenCode account / one key, two endpoints**
(`/zen/go/v1` vs `/zen/v1`); the Zen row sets **`keyId: 'opencode-go'`** so it borrows Go's stored key via
`resolveKeyId`/`keySlotFor`. This also dictated the #12 migration: the zen→go move **deletes** the old
`opencode-zen` slot, because a Go key left in it would be inherited by the new `/zen/v1` row → 401. When
adding any Provider that shares an existing account's key, set `keyId` — don't make the user enter it twice.
See [[decisions]] 2026-06-18 Zen/Go-split-built entry.

### Served models are reasoning models — strip `<think>` and DON'T cap tokens
Most `zen/go` ids (minimax-m3, mimo, qwen3*, glm5*) emit chain-of-thought **inline** as `<think>…</think>`, then the real answer. Two consequences: (1) `stripThink` (in `src/catalog.ts`, composed into `extractEditText`) must drop the block (and treat an unterminated `<think>` as "no answer yet" → return nothing) or the Inquire edit is the model's thinking; (2) a low `max_tokens` cap starves the answer — the model spends the budget thinking and never reaches code. `maxTokens` default is therefore `0` (uncapped); `max_tokens` is omitted from the request unless set `>0`. For snappy edits use a non-reasoning id (`deepseek-v4-flash`, `kimi-k2.6`). See [[decisions]].

### Output-channel logs persist on disk — read them to debug a user's error
`OutputChannel` content is written to `%APPDATA%\Code\logs\<session>\window<n>\exthost\output_logging_<ts>\<n>-Wisp.log`. When the user can't surface the Output panel, glob the newest matching file and grep `[error]` instead of walking them through the UI. This is how the `401 … not supported` cause was found.

### Packaging ships node_modules — bundling is optional (size only)
**Empirically verified:** `vsce package` includes production `dependencies`, so `node_modules/openai` is inside the `.vsix` and the extension runs installed without esbuild/webpack. (The earlier claim that it "won't ship without bundling" was wrong.) Bundling remains worth doing later to shrink the package — the unbundled `.vsix` is ~1402 files / 2.33 MB and vsce warns about it — but it is not a correctness blocker.

### Ollama Cloud base URL is `/v1`, NOT `/api/v1`
Ollama Cloud (`ollama.com`, the **hosted** service — distinct from local `localhost:11434`) is
OpenAI-compatible at `https://ollama.com/v1`. The `/api` prefix (`/api/chat`, `/api/tags`) is Ollama's
**native** protocol and breaks the OpenAI SDK. Use `/v1` for the catalog row; key env var
`OLLAMA_API_KEY` (Bearer). Local Ollama needs no key. Verified 2026-06-15 (multi-provider research).

### The Provider selector is a key-redirect vector — keep it out of workspace reach
The Active Provider selects which base URL the bearer API key is sent to, so it carries the exact
threat the Custom base URL does: anything workspace-overridable lets a hostile repo redirect the key
to an attacker endpoint. Pre-#59 the defense was `"scope": "machine"` on the settings; since #59 both
live in `~/.wisp/config.json`, which no workspace can touch — and the one remaining settings read (the
one-time migration seed) MUST use `inspect().globalValue`, never the merged `get()`, because scope
enforcement died with the settings' registration. Built-in base URLs MUST stay in code (the
`PROVIDERS` catalog). Don't relax any of this without re-reading the 2026-06-15 multi-provider ADR.

### VS Code `wisp.*` settings are dead knobs (except maxTokens/temperature)
Editing `wisp.provider`/`wisp.baseUrl`/`wisp.model`/`wisp.bridge.*` in settings.json does nothing
since #59 — state lives in `~/.wisp/config.json` (hand-edit THAT; the extension watches it). Old
entries linger in users' settings.json as "unknown setting" — harmless, deliberately not auto-removed
(updating unregistered keys isn't reliably allowed).

### Cline ToS, and why Copilot/Cursor were dropped
Cline's ToS §2.2 bars use "to develop competing products… or otherwise to our detriment." Ship the Cline
Provider **user-supplied-key only** (never an embedded/shared/proxied key) + a one-line in-panel note
that the user owns their ToS compliance. **GitHub Copilot** and **Cursor** were dropped entirely —
Copilot's only path is reverse-engineered client impersonation (account-ban risk); Cursor's API is
shape-incompatible (no `/chat/completions`) and "auth-only" use means session-token piggybacking (ToS
violation). Don't re-add them as "OAuth providers" — OAuth doesn't fix *why* they fail. See the
2026-06-15 ADR.

### Unit-testable logic must live vscode-free in `catalog.ts`, not in `extension.ts`
`extension.ts` imports `vscode` (and `openai`) at the top, so a plain Vitest/Node test can't import it —
there's no Extension Development Host outside VS Code, so the import throws. Pure, unit-testable logic
therefore lives in `src/catalog.ts`, which **imports nothing**: `resolveModel`, `resolveBaseUrl`,
`planLegacyMigration` (the migration's decision as a pure plan; `extension.ts` applies it), and the
Inquire helpers `buildEditPrompt` / `extractEditText` (`stripThink` + `stripFences`). The
`extension.ts` wrappers read VS Code state and delegate. Don't fold this logic back inline "to keep it
together" — it becomes untestable. Tests are kept out of the extension build via `tsconfig` `exclude:
["src/**/*.test.ts"]`. Run `npm test`. See [[decisions]].

### Don't make the Inquire edit span the whole file — the model mangles untouched code
Inquire sends the whole file as **context** but the edit replaces only the **target span** (selection /
current-line). A mid-session experiment widened the no-selection span to the whole file so the model
could "edit anywhere" — but a whole-file **re-emit** makes the model drop/reformat unrelated lines; the
B2 diff faithfully renders the damage and **Accept would apply it → data loss**. `diffLines` is correct
(it showed a minimal diff of a mangled reply). Caret-agnostic "edit anywhere" is delivered safely by the
**SEARCH/REPLACE edit-blocks** slice (#8), which emits only changed regions. Don't reintroduce whole-file
re-emit as the edit path. See [[decisions]] 2026-06-17 edit-fidelity entry.

### Edit blocks are flaky with reasoning models — the failure is SAFE, and retry usually works
Inquire's SEARCH/REPLACE matching is **exact** (EOL-agnostic only, no whitespace-fuzz). Reasoning models
don't reliably copy code verbatim, so a given run can: return a SEARCH that isn't byte-present → all
blocks miss → **"could not locate the text to edit"**; or return no blocks at all → **"nothing to
change"**. Re-running the same instruction usually yields a matching block (it's model variance, not a
parser bug — confirmed in F5: one run missed, the reload+retry passed). This is **by design** — a miss
is surfaced and skipped, never force-matched, so the file is never corrupted (no data loss). Don't "fix"
the flakiness by loosening to fuzzy/trimmed matching reflexively — that trades a safe miss for a
wrong-region false match. The fuzzy-matching fork is deferred; take it only if misses prove frequent in
real use. The throwaway `[debug]` reply/`trimmedMatch` instrumentation in `inquire` (used to tell
indent-drift from paraphrase) was removed after diagnosis — re-add it the same way if revisiting. See
[[decisions]] 2026-06-17 edit-blocks-built entry.

### Codex: bearer is the access_token, NOT the exchanged API key
For the subscription path (`https://chatgpt.com/backend-api/codex/responses`), the bearer is the OAuth
**`access_token`** + the `chatgpt-account-id` header. The id_token→`sk-` exchange (`exchangeCodexIdTokenForApiKey`
in the reference) produces an **API-platform** key billed against `api.openai.com` — a *different* endpoint. Wisp
keeps `apiKey` only as a fallback; `codexClient` sends `creds.accessToken || creds.apiKey`. Don't switch the
default bearer to the exchanged key — it routes off the subscription. `chatgpt-account-id` is **hard-required**:
absent → error early (`codexClient` throws) rather than send a header-less request that 401/403s opaquely.

### Codex reasoning models REQUIRE a `reasoning` object — and `gpt-5-codex` is a dead id
The Codex `/responses` backend **400s** a gpt-5/o-series request that omits `reasoning: { effort, summary:'auto' }`,
and **400s** a gpt-4.x/spark request that *includes* it — so it's per-model (`codexReasoning` in `catalog.ts`:
`medium` for gpt-5/o, undefined for gpt-4.x/`*-spark`). Separately, **`gpt-5-codex` is not a valid model id**
(400); the live lineup is `gpt-5.5`/`gpt-5.4`/`gpt-5.3-codex`/`gpt-5.3-codex-spark`/`gpt-5.2-codex`/
`gpt-5.1-codex-max`/`gpt-5.1-codex-mini`/`gpt-5.4-mini`/`o3`/`o4-mini` (the codex row default is `gpt-5.3-codex`).
There is **no `/models` route** on the Codex backend, so the dropdown uses the hardcoded `CODEX_MODELS` list,
not a live fetch. Both confirmed by the #13 F5 round-trip. See [[decisions]] 2026-06-19.

### Codex sign-out must write a tombstone, not delete the slot
`CodexAuth.signOut` stores an empty `{}` to `wisp.codexAuth` instead of `secrets.delete`. If it deleted, the
next `current()`/`isSignedIn()` would **re-import `~/.codex/auth.json`** (a Codex-CLI login) and instantly
re-sign-in — sign-out would never stick for a CLI user. A present-but-bearer-less blob reads as signed-out
*and* suppresses the import. Only an **unwritten** slot (undefined) triggers the one-time auth.json import; a
tombstone does not. Don't "simplify" sign-out back to a delete.

### The chat/Ctrl+I picker hard-filters on `toolCalling` — a text-only model is INVISIBLE
VS Code shows ONLY tool-capable models in the chat / Ctrl+I / agent picker. A model advertising
`toolCalling: false` is absent **everywhere** the picker appears — Ask mode included; it shows up **only** in
the Manage Models list (which lists every registered model, regardless of capability). Docs: "if the model
doesn't support tool calling, it won't be shown in the model picker" (confirmed by #14 F5). Consequence:
**Codex advertises `toolCalling: true` so it is selectable**, and as of #15 the flag is **honest** (tools are
forwarded + round-tripped). `buildChatModelInfos` sets `toolCalling: true` for every row. Don't set it false
for a model you still want selectable. (`imageInput`/vision is NOT filtered on — only `toolCalling`.)

### Codex `/responses` requires a non-empty `instructions` — default it for native chat
The backend **400s "Instructions are required"** if `instructions` is absent or empty. Inquire never hit this
(`buildEditPrompt` always emits a system message), but the native-chat path has **no System role** (VS Code's
chat API only has User/Assistant), so it sent none → 400. `buildCodexResponsesBody` now **defaults**
`"You are a helpful coding assistant."` when no system turn is present; `CodexResponsesBody.instructions` is
required, not optional. Don't make it omittable again.

### Codex Responses input: assistant content is `output_text`, user/system is `input_text`
A replayed **assistant** turn's content part must be typed `output_text`; user/system stay `input_text`. The
Responses API rejects the wrong type. `buildCodexResponsesBody` picks per role. Images (`input_image`) ride
only on non-assistant turns (the API rejects `input_image` on assistant items). Mirrors XETH-7's codexShim
`convertContentBlocksToResponsesParts`.

### Codex caps come from `codexModelCaps`, not models.dev — and it IS vision-capable
The Codex row has no models.dev `catalogKey` and the backend has no `/models` route, so the live-caps path
(which retired the context guess table) can't reach these ids. `codexModelCaps` (in `catalog.ts`) supplies
real windows — gpt-5.x **400K/32K**, o-series **200K/100K** — and `vision: true`. `chatProvider`'s caps
resolver routes codex rows to it. **Vision is real**: gpt-5/o are multimodal and the Codex backend accepts
`input_image` (XETH-7's codexShim forwards it to the same endpoint) — don't be misled by Copilot's
conservative `modalities: ['text']` registry flag, which understates it. This is the one place a small
codex-only caps table is intentional (see [[decisions]] 2026-06-19); don't fold codex back to the neutral
default.

### Codex tools must be STRICT, and a replayed `function_call` needs only `call_id` (not `id`)
Two facts for the #15 agent round-trip. **(1) Strict schemas:** `toCodexResponsesTools` runs every tool's
`inputSchema` through `enforceStrictResponsesSchema` — every object gets `additionalProperties:false` and
**all** its keys listed in `required` (recursively, incl. array `items` and `anyOf/oneOf/allOf`), and the
tool carries `strict:true`. Codex strict mode **rejects** an open or partially-required object. The tool is
**flat** (`{type,name,description,parameters,strict}`), NOT chat-completions' nested `function` object —
don't reuse `toOpenAiTools` for Codex. **(2) call_id-only round-trip:** the replayed `function_call` input
item carries **`call_id`, name, arguments** — **no `id`**. With `store:false` the request is stateless, so
there is no prior server item for an `id` to reference; the F5 round-trip succeeded sending call_id-only.
XETH-7 *also* sends a derived `id` (`fc_…`) — unnecessary here. If a future multi-turn flow 400s on the
round-trip, add `id` to the `function_call` item in `buildCodexResponsesBody` (one line). The reducer
(`reduceResponsesToolCalls`) keys streamed events by the **item id** but surfaces **call_id** as the
round-trip id — that is what `function_call_output.call_id` must match. See [[decisions]] 2026-06-19.

### Two Wisp extensions at once → "already registered" warnings + a stale panel (F5 vs installed VSIX)
F5 launches the dev build (`EsarinAzx.wisp` — current `package.json` publisher) while an **old installed
VSIX** is still enabled. The actual stale id was **`local.opencode-autocomplete@0.0.4`** ("OpenCode Zen
Autocomplete" — this project from BEFORE the Wisp rename), **not** `local.wisp` (that was never installed;
earlier notes guessed wrong). Confirmed + uninstalled 2026-06-24 via `code --list-extensions`. Different
extension ids but the **same `wisp.model` / `wisp.baseUrl` / `wisp.provider` setting keys**, so VS Code logs
**"Cannot register 'wisp.X' — this property is already registered"** (blamed on whichever loads second), and
the side panel you see may be the **stale installed build** — none of the new UI (e.g. the Effort knob) shows.
Not a code bug, a dev-environment dup. Fix: list installed extensions and **uninstall the stale local one
before F5** — `code --list-extensions | grep -E 'wisp|opencode'` then `code --uninstall-extension <id>` —
then stop the debug session and F5 again. Disappears once a single published extension id exists.
(`wisp.effort` is globalState, not a contributed setting, so it never collides.)

### Anthropic OAuth: a valid token still 429s without the Claude Code client fingerprint
The subscription Messages backend (`https://api.anthropic.com/v1/messages` via Claude.ai OAuth) **gates on a
server-validated client fingerprint**. A request with only `Authorization: Bearer <oauth>` +
`anthropic-version` + `anthropic-beta: oauth-2025-04-20` returns a **synthetic** 429:
`{"type":"rate_limit_error","message":"Error"}` — and the **tell that it's not a real limit is the ABSENCE of
`anthropic-ratelimit-*` headers and `retry-after`** (a genuine limit always includes them). Three signals are
mandatory (all in `src/anthropicClient.ts` / `catalog.ts`, openclaude-verified):
1. `anthropic-beta: claude-code-20250219,oauth-2025-04-20` (COMMA list — the `claude-code-*` beta is the
   primary gate; the oauth beta **alone is not enough**).
2. `User-Agent: claude-cli/0.19.0 (external, cli)` + `x-app: cli`. The inference UA token is **`claude-cli/`**,
   NOT `claude-code/` (that variant is MCP/WebFetch only).
3. The **first `system` block** = `x-anthropic-billing-header: cc_version=0.19.0.<fp>; cc_entrypoint=cli;`
   where `<fp> = sha256('59cf53e54c78' + msg[4]+msg[7]+msg[20] + version)` first **3 hex** chars, sampled from
   the **first user message** (missing index → `'0'`). The server recomputes it, so `anthropicAttribution` MUST
   run over the exact text sent, and `cc_version` must equal the UA version. `anthropicFingerprint` /
   `anthropicAttribution` are pure + TDD'd (`anthropic.test.ts`).
The **identity prose is NOT gated** (openclaude ships an "OpenClaude" identity and serves — Wisp keeps its own
system prompt), but a system block IS required (the attribution one). The `cch=00000` native-attestation token
(Bun's `Attestation.zig`) is **omitted** — unreproducible from Node and currently unenforced; the request
serves without it. If Anthropic enforces it later, the Anthropic path breaks (Bun forks survive). To debug a
future 429, dump the response headers first — no rate-limit headers ⇒ recognition/fingerprint, not a real
limit. See [[decisions]] 2026-06-23.

### `setEffort` (and any globalState write) fires no config event — re-push the panel yourself
`setModel` mirrors into `wisp.model`, and the `onDidChangeConfiguration` listener re-`postState()`s the
panel. A **globalState** write (`wisp.models`, `wisp.effort`) triggers **no** event, so a mutation that only
touches globalState must call `panel.postState()` itself or the controlled input won't reflect the change.
`setEffort` does exactly this. Don't remove that line, and remember it for any future globalState-backed knob.

### Effort levels are NOT one ladder — `xhigh` and `max` are independent per-model capabilities
`low|medium|high|xhigh|max` reads like one ascending scale, but `xhigh` and `max` are distinct features with
**different** model sets: `max` = Opus 4.6/4.7/4.8, `xhigh` = Opus 4.7/4.8 (+ OpenAI/Codex). **Opus 4.6 takes
`max` but rejects `xhigh`** — do not assume `max ⊃ xhigh`. Sonnet 4.6 / Opus 4.5 take neither (ceiling =
`high`). The panel offers the full ladder to every effort-capable Claude (mirrors the first-party `/effort`
slider) and `anthropicThinkingEffort` clamps the wire to each model's ceiling — so a level shown in the picker
may silently degrade (e.g. Sonnet `max` → `high`). That is intended, not a bug. Source of truth: openclaude
`src/utils/effort.ts` (`modelSupportsMaxEffort`, `modelSupportsXHighEffort`). See [[decisions]] 2026-06-23.

### Testing the Bridge from PowerShell: `curl.exe` mangles inline JSON — use `Invoke-RestMethod`
PowerShell 5.1 strips the double-quotes out of an inline JSON body (`-d '{"model":"x"}'`) when forwarding it
to a native exe, so `curl.exe` receives non-JSON and the Bridge correctly answers `400 request body is not
valid JSON` (its degrade-to-400 path — **not** a listener bug). For Bridge F5 tests use the PS-native
`Invoke-RestMethod` (build the body with `ConvertTo-Json`), or a `-d "@body.json"` file body. Also: the OpenAI
`model` field is a **Provider id** (`opencode-go`), not a model name and not the bare `opencode` (bare
`opencode` → `404 unknown provider`); `GET /v1/models` lists the usable keyed ids. And `curl` (bare) is a
PowerShell alias for `Invoke-WebRequest` with different flags — always call `curl.exe` explicitly.

### Bridge `COPILOT_*` env vars reach only terminals opened AFTER Start (#38)
`context.environmentVariableCollection` applies at **terminal creation**, so a terminal already open when you
click Start keeps the old (empty) env and won't see the Bridge — open a **fresh** terminal after Start, or
relaunch it (VS Code shows a stale-env warning icon on the tab). Two more: the collection is `.persistent` by
default, so Wisp `clear()`s it **on activate** as well as on stop (else a reload re-applies last session's
dead-port `BASE_URL` + stale secret while the Bridge is OFF) — don't drop that activate-time clear; and
`COPILOT_MODEL` re-syncs on a Provider **or** model switch while running (#b), so a **new** terminal picks up the
current choice. All three Provider kinds (keyed/codex/anthropic) answer over the Bridge now.

### The standalone GUI Copilot app does NOT route through the Bridge (#b)
The `COPILOT_*` vars are injected into VS Code **integrated terminals** only. The standalone GitHub Copilot
**desktop/GUI app** (launched from the Start menu) inherits no terminal env → it talks to GitHub, not the Bridge,
and its model picker shows GitHub's own catalog (Auto/Haiku/GPT-5 mini/…), never Wisp Providers. Drive the Bridge
with `copilot` in a terminal opened after Start. (An app launched *by a command typed in a Bridge-env terminal*
would inherit it; from the Start menu it won't.)

### Copilot CLI label is a launch snapshot; running terminals follow the ACTIVE Provider (#b)
`COPILOT_MODEL` = the resolved **model name** (not the Provider id) so Copilot's UI shows the real model — but the
env is fixed at terminal creation, so the **label** is a snapshot from launch. The model **used** stays live
(Bridge re-resolves per request). Consequence of the loose routing fallback: a running Copilot terminal sends a
model name (not an id), which routes to whatever the **active** Provider is *now* — so switching the panel Provider
makes open terminals follow it, rather than staying pinned to their launch Provider. curl can still address a
specific Provider by its **id** (`codex`/`anthropic`/`opencode-go`).

### `Ctrl+R` in the Extension Dev Host runs the STALE build — recompile first (#46)
The extension runs the compiled bundle (`packages/vscode/dist/extension.js` since #58; `out/` before), not the TS
source. `Ctrl+R` (Reload Window) reloads the extension host against **whatever `dist/` already holds** — it does
NOT recompile. Only a full **stop → F5** re-runs the `compile: vscode` preLaunchTask. So after editing source, a
bare `Ctrl+R` silently tests the OLD code (cost two demo rounds — the identical error reappeared byte-for-byte).
Fix: run `bun run compile` in `packages/vscode` THEN `Ctrl+R`, or do a full stop+F5. The dup-panel trap makes
recompile+`Ctrl+R` the safer combo (no fresh F5). Note `tsc` alone no longer produces a runnable build — it's
typecheck-only since #58; the bundle comes from esbuild (`bun run bundle`).

### The Bridge Anthropic door forwards Codex tools non-strict — external schemas can't be strict-coerced (#46)
Codex strict Responses tools demand a fixed closed shape; Claude Code's built-in tools (esp. `AskUserQuestion`'s
dynamic answer map) 400 under strict, one keyword at a time. The door sends `toCodexResponsesTools(tools, false)`
so the schema rides through verbatim. If you re-enable strict on any door path, expect `propertyNames` /
`required`-mismatch 400s from real Claude Code. See [[decisions]] 2026-07-13 (non-strict door tools).

### "Model can't see the image" over the Bridge — read `images=N` in the log BEFORE touching code (#51+)
Claude Code sends every attach with its **source path as text** (`[Image: source: C:\...png]`), so a
Codex-tuned model often calls Read on the path even when the inline pixels arrived — that LOOKS like a
vision bug and is model habit. Ground truth is the door's per-request log line suffix **`images=N`**:
`0` ⇒ the client never sent pixels (client-side gating); `>0` ⇒ any blindness is downstream of the door
(builders are pure + unit-tested, so suspect the backend). Also remember BOTH 2026-07-14 fixes: the
Anthropic provider path in `startProviderStream` must keep forwarding `images`, and `splitUserBlocks`
must keep hoisting `tool_result`-embedded images (Read-on-image pixels ride INSIDE tool_result content).
A model "describing" an image it never saw is a real failure mode — dimensions come from Read's text
metadata and the rest is context-plausible bluff; don't accept a description as proof of vision.

## Related
- [[api]]
- [[decisions]]
- [[overview]]
