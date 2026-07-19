---
type: gotchas-index
project: wisp
updated: 2026-07-19
tags: [context, gotchas]
---

# Gotchas

Non-obvious traps. One file per trap in `gotchas/`. A flat list.

- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]] — deriving the Anthropic cache TTL from `convo.length` flips 5m→1h between turn 1 and turn 2 of the same session; a TTL change rewrites `cache_control` and busts the server-side prefix cache (2× re-bill on turn 2 of every session). Fix TTL per call path, never from turn count
- [[codex-502-input-exceeds-context-window-is-the-providers-limit-not-the-bridge]] — codex `502 … input exceeds the context window` is a passthrough of the codex window (400K gpt-5.x / 200K o-series), not a bridge bug; bridge forwards untrimmed, `/compact` before codex turns
- [[live-verify-the-bridge-from-source-isolated-wisp-home-on-a-spare-port]] — test bridge changes with `WISP_HOME=<tmp>` + `serve` on a spare port (41185), never kill 41184; `x-api-key` = top-level `bridgeSecret` in auth.json, not `.anthropic.bridgeSecret`
- [[select-mouse-leans-on-opentui-privates]] — SELECT_MOUSE (scrollbar drag/wheel/row click) reads opentui privates, pinned 0.4.3; new selects must spread it, upgrades must re-run `bun test` in packages/tui
- [[slot-skill-has-two-copies-personal-vs-plugin]] — Slot skill is plugin-only now (personal copy retired 2026-07-17); repo edits to `plugins/slot/**` need `claude plugin update wisp-slot` (versioned cache) — except the statusline badge, which the wrapper runs from the checkout
- [[accidental-tui-open-rewrites-all-family-routes]] — An agent's accidental `wisp` TUI open can silently rewrite ALL family routes (quick-setup); snapshots taken after preserve the damage
- [[powershell-profile-env-masks-session-env]] — PowerShell profile sets ANTHROPIC_BASE_URL, so PowerShell env checks claim every session is bridged; use Bash to read real process env
- [[bridged-family-routes-bound-to-anthropic-burn-max-quota]] — Family routes bound to `anthropic` bill the Claude Max plan — background haiku chores burn it even in "GPT sessions"; rebind haiku off `anthropic` first
- [[claude-code-advisor-is-endpoint-gated-past-the-bridge]] — Advisor still needs native `claude` today, BUT root cause corrected 2026-07-19: not upstream-gated — the native picker works through the Bridge; it's a server-executed tool Wisp's door never fulfills. Fixable Wisp-side, planned 2.0.21 → [[2026-07-19-wisp-native-advisor-via-door-server-tool]]
- [[opentui-rows-garble-on-small-terminals-without-wrapmode-none-and]] — opentui: rows garble on small terminals without `wrapMode="none"` (wrap overlay) + `flexShrink={0}` (yoga row-shrink)
- [[ts7-drops-types-auto-include-when-types-unset]] — TS 7 drops `@types/*` auto-include when `types` is unset (node/DOM globals vanish; set `types:["node"]`)
- [[opentui-selects-are-invisible-without-an-explicit-height-and-bare]] — opentui: selects are invisible without an explicit height, and bare exit strands the terminal
- [[no-fill-in-middle-fim-on-the-zen-endpoint]] — No fill-in-middle (FIM) on the Zen endpoint
- [[webview-csp-tailwind-v4]] — Webview CSP × Tailwind v4
- [[two-typescript-configs-must-stay-separate]] — Two TypeScript configs must stay separate
- [[vite-asset-names-must-be-deterministic]] — Vite asset names must be deterministic
- [[config-writes-must-target-the-defining-scope-not-always-global]] — Config writes must target the defining scope, not always Global
- [[server-error-bodies-can-leak-the-key-sanitize-before-posting-to-the]] — Server error bodies can leak the key — sanitize before posting to the webview
- [[key-is-write-only-across-the-webview-boundary]] — Key is write-only across the webview boundary
- [[model-ids-are-bare-on-zen-go-v1-the-opencode-prefix-is-rejected]] — Model ids are BARE on `zen/go/v1` — the `opencode/` prefix is rejected
- [[a-shared-credential-provider-must-set-keyid-or-its-hidden-from-the]] — A shared-credential Provider must set `keyId` or it's hidden from the chat picker
- [[served-models-are-reasoning-models-strip-think-and-dont-cap-tokens]] — Served models are reasoning models — strip `<think>` and DON'T cap tokens
- [[output-channel-logs-persist-on-disk-read-them-to-debug-a-users-error]] — Output-channel logs persist on disk — read them to debug a user's error
- [[packaging-ships-node-modules-bundling-is-optional-size-only]] — Packaging ships node_modules — bundling is optional (size only)
- [[ollama-cloud-base-url-is-v1-not-api-v1]] — Ollama Cloud base URL is `/v1`, NOT `/api/v1`
- [[the-provider-selector-is-a-key-redirect-vector-keep-it-out-of]] — The Provider selector is a key-redirect vector — keep it out of workspace reach
- [[vs-code-wisp-settings-are-dead-knobs-except-maxtokens-temperature]] — VS Code `wisp.*` settings are dead knobs (except maxTokens/temperature)
- [[cline-tos-and-why-copilot-cursor-were-dropped]] — Cline ToS, and why Copilot/Cursor were dropped
- [[unit-testable-logic-must-live-vscode-free-in-catalog-ts-not-in]] — Unit-testable logic must live vscode-free in `catalog.ts`, not in `extension.ts`
- [[dont-make-the-inquire-edit-span-the-whole-file-the-model-mangles]] — Don't make the Inquire edit span the whole file — the model mangles untouched code
- [[edit-blocks-are-flaky-with-reasoning-models-the-failure-is-safe-and]] — Edit blocks are flaky with reasoning models — the failure is SAFE, and retry usually works
- [[codex-bearer-is-the-access-token-not-the-exchanged-api-key]] — Codex: bearer is the access_token, NOT the exchanged API key
- [[codex-reasoning-models-require-a-reasoning-object-and-gpt-5-codex-is]] — Codex reasoning models REQUIRE a `reasoning` object — and `gpt-5-codex` is a dead id
- [[codex-sign-out-must-write-a-tombstone-not-delete-the-slot]] — Codex sign-out must write a tombstone, not delete the slot
- [[the-chat-ctrl-i-picker-hard-filters-on-toolcalling-a-text-only-model]] — The chat/Ctrl+I picker hard-filters on `toolCalling` — a text-only model is INVISIBLE
- [[codex-responses-requires-a-non-empty-instructions-default-it-for]] — Codex `/responses` requires a non-empty `instructions` — default it for native chat
- [[codex-responses-input-assistant-content-is-output-text-user-system-is]] — Codex Responses input: assistant content is `output_text`, user/system is `input_text`
- [[codex-caps-come-from-codexmodelcaps-not-models-dev-and-it-is-vision]] — Codex caps come from `codexModelCaps`, not models.dev — and it IS vision-capable
- [[codex-tools-must-be-strict-and-a-replayed-function-call-needs-only]] — Codex tools must be STRICT, and a replayed `function_call` needs only `call_id` (not `id`)
- [[two-wisp-extensions-at-once-already-registered-warnings-a-stale-panel]] — Two Wisp extensions at once → "already registered" warnings + a stale panel (F5 vs installed VSIX)
- [[anthropic-oauth-a-valid-token-still-429s-without-the-claude-code]] — Anthropic OAuth: a valid token still 429s without the Claude Code client fingerprint
- [[seteffort-and-any-globalstate-write-fires-no-config-event-re-push-the]] — `setEffort` (and any globalState write) fires no config event — re-push the panel yourself
- [[effort-levels-are-not-one-ladder-xhigh-and-max-are-independent-per]] — Effort levels are NOT one ladder — `xhigh` and `max` are independent per-model capabilities
- [[testing-the-bridge-from-powershell-curl-exe-mangles-inline-json-use]] — Testing the Bridge from PowerShell: `curl.exe` mangles inline JSON — use `Invoke-RestMethod`
- [[bridge-copilot-env-vars-reach-only-terminals-opened-after-start-38]] — Bridge `COPILOT_*` env vars reach only terminals opened AFTER Start (#38)
- [[the-standalone-gui-copilot-app-does-not-route-through-the-bridge-b]] — The standalone GUI Copilot app does NOT route through the Bridge (#b)
- [[copilot-cli-label-is-a-launch-snapshot-running-terminals-follow-the]] — Copilot CLI label is a launch snapshot; running terminals follow the ACTIVE Provider (#b)
- [[ctrl-r-in-the-extension-dev-host-runs-the-stale-build-recompile-first]] — `Ctrl+R` in the Extension Dev Host runs the STALE build — recompile first (#46)
- [[the-bridge-anthropic-door-forwards-codex-tools-non-strict-external]] — The Bridge Anthropic door forwards Codex tools non-strict — external schemas can't be strict-coerced (#46)
- [[model-cant-see-the-image-over-the-bridge-read-images-n-in-the-log]] — "Model can't see the image" over the Bridge — read `images=N` in the log BEFORE touching code (#51+)
- [[npm-spam-filter-a-green-publish-can-vanish-minutes-later]] — npm spam filter: a green publish can vanish minutes later
- [[github-runners-macos-13-is-a-zombie-label-opentui-selects-is]] — GitHub runners: macos-13 is a zombie label; opentui select's ▶ is ambiguous-width

## Related

- [[overview]]
