---
type: decisions-index
project: wisp
updated: 2026-07-23
tags: [context, decisions]
---

# Decisions

Settled questions. One file per decision in `decisions/`. Newest first.

For substantial architectural decisions prefer an ADR in `docs/adr/` and link it from an entry here.

- [[2026-07-23-usage-limit-cooldown-family-fallback-only]] — **SHIPPED 2.0.34:** usage-limit 429 cooldown is in-memory (restart clears; persistence strands recovered providers) and only family-matched claude-* routes fall back to anthropic (#161); provider-id/alias stay honest, transient 429s never cool
- [[2026-07-21-server-cache-diagnosis-adopted]] — cache-diagnosis-2026-04-07 adopted on the OAuth path (#156, probe #152): server `cache_miss_reason` authoritative in the MISS log, heuristic retained (server silent on PARTIAL; null ≠ healthy); conversation chain keyed model + first user turn; inbound diagnostics passthrough + non-trailing token position deliberately not built
- [[2026-07-21-beta-selection-model-gated-exclusion]] — `selectAnthropicBetas(model)` picks anthropic-beta per request (#151): context-1m is an exclusion gate (haiku/claude-3/opus<4-6 out) so new families inherit 1M; Haiku keeps claude-code (agentic + 429 gate, deviates from real claude's non-agentic drop); heavier-shape betas + inbound door passthrough deliberately not built (door normalizes, those shapes never leave wisp)
- [[2026-07-21-session-id-per-process-metadata-identity]] — `metadata.user_id.session_id` stays per-process (shared across bridged conversations; live-accepted, per-conversation plumbing deliberately not built) and account identity rides ON `AnthropicCreds` in auth.json (refresh must carry it, sign-out keeps deviceId, pre-#150 creds get derived fallbacks) (#150)
- [[2026-07-21-anthropic-oauth-fingerprint-unvalidated]] — the `cc_version` billing fingerprint is NOT validated (real `2.1.216.c5e` vs wisp recipe `2b0`, wisp accepted anyway) → version bump is zero-risk, the salt/index math is theater; live `claude-cli 2.1.216` capture drove a wire-parity backlog (umbrella #148 + #149–#152); wisp is behind OmniRoute on fingerprint fidelity; all cache-facing items are parity not fixes (fallback already ~1/392)
- [[2026-07-21-positioned-mid-conversation-system-matters]] — mid-conversation `role:system` turns must keep their position through the Anthropic door: hoisting into the volatile suffix re-bills the whole history every ~7 bridged requests (10× native fallback rate, 0.6–1.2M tokens/session); overturns #46's "fine for the translator" deferral (fix #145, guard gap #146)
- [[2026-07-21-advisor-usage-iterations-shape]] — **SHIPPED 2.0.28, live-verified:** advisor reviewer cost rides as openclaude-style `usage.iterations` (`advisor_message` entries with the *resolved* Target model, final base pass last — the slot Claude Code reads as the context window); omission over zeros, `advisor_usage` event never touches the `usage` channel / #111 guard (#143)
- [[2026-07-20-system-split-at-client-marker]] — **SHIPPED 2.0.25, live-verified:** Anthropic door splits system at the client's own `cache_control` marker (`systemSplit{stable,volatile}` beside unchanged full-join `system`; volatile rides as unmarked `systemSuffix` block after the breakpoint) — mid-session `<system-reminder>` appends stop re-billing the whole prefix; cacheOutcome gains the creation-shaped miss (#139)
- [[2026-07-20-row-based-routing-snapshots-cli]] — 2.0.24 `wisp snapshot`/`revert`: row-based Routing-map Snapshots owned by the CLI (refuse-if-held, revert prints-what-it-overwrote); Slot skill goes CLI-native, lease files retire (spec #126)
- [[2026-07-19-advisor-cache-control-mutation-and-reviewer-frame]] — **SHIPPED 2.0.22, live-verified:** `buildAnthropicMessagesBody` must replay a stripped *copy* of `rawContent` (never mutate the caller's array — advisor multi-build stacked markers past Anthropic's cap of 4 → "Found 5"); reviewer gets quarantined `reviewerSystem()` + flattened `serializeForReview()` (no base system, no raw turns) so it reviews instead of echoing
- [[2026-07-19-wisp-native-advisor-via-door-server-tool]] — **SHIPPED 2.0.21, live-verified:** door plays the advisor server-tool role — forwards an `advisor` tool to the base Target, runs a separate reviewer pass when called (picker model via Routing map, any Target advises any other), streams `server_tool_use`+`advisor_tool_result` back, resumes the base turn; Stage 0 (from the real binary) = Flavor A, a wisp session is `firstParty`; launcher+snippets set `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1` (claude-wisp-* has no advisor_rank → tool otherwise never sent); stale "endpoint-gated" warning removed
- [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]] — cache TTL fixed per request PATH (`anthropicStream`→1h, `anthropicInquire`→5m, haiku always 5m), never from `convo.length`; supersedes the TTL half of #111, shipped 2.0.20; the turn-count proxy flipped 5m→1h mid-session and busted the prefix cache
- [[2026-07-18-vscode-panel-mirrors-tui-bridge-no-env-snippets]] — vscode Claude Code card mirrors the TUI `/bridge` screen (launch line + plugin nudge + Advisor caveat); removed #47's copy-paste env snippets because they rendered the live secret as plaintext; core builder kept for a future guarded reveal
- [[2026-07-18-openclaude-cache-control-steal-list]] — OpenClaude cache_control steal list: #1 (bare 5m one-shot / ttl:1h multi-turn) SHIPPED 2.0.19; #2 already true via STEP; #3 parked; do NOT port cache_edits / break detection / marker pass-through (#111 stays load-bearing)
- [[2026-07-18-real-usage-meter-forward-not-synthesize]] — Anthropic door forwards the backend's real token usage (input/cache/output) instead of synthesized zeros; `message_start` deferred to the first usage event; non-Anthropic through the door still zeros
- [[2026-07-18-slot-parallel-per-family-leases]] — wisp-slot 1.2.0: concurrent Slots via per-family `lease-<family>.json`, up to 4 distinct Targets at once; reverses #110 §98 out-of-scope line (safety invariant is per-family)
- [[2026-07-18-thinking-passthrough-raw-sidecar]] — thinking fidelity via stateless raw-sidecar replay + event vocabulary; live probes killed the strip-retry insurance; Claude 5 joins the effort regexes (v2.0.17)
- [[2026-07-17-wisp-router-gets-its-own-changelog]] — TUI/CLI releases changelog in `packages/tui/CHANGELOG.md` from 2.0.11 on; vscode product changelog stays extension-versioned (folds ≤2.0.10)
- [[2026-07-17-slot-plugin-only-session-awareness-hook-badge]] — wisp-slot 1.1.0: SessionStart hook + statusline badge (env+home detection, node, family-level badge); personal skill copy retired — plugin via local directory marketplace is the one copy (#124)
- [[2026-07-17-bridge-idempotent-on-showlog-panel-command-first-headless-cli]] — /bridge = ensure-on + show, /bridge off only stop; /show-log ring-buffer Screen; headless CLI command-first (`wisp providers`, `wisp models <provider>`); wisp-slot session-awareness parked
- [[2026-07-17-slot-skill-ships-as-repo-plugin-marketplace]] — Slot skill ships as Claude Code plugin `wisp-slot`; repo doubles as the plugin marketplace (reverses #107's out-of-scope line)
- [[2026-07-17-slot-skill-lease-file-explicit-restore]] — Slot skill: lease file + explicit guarded restore, no SessionEnd hook (no guaranteed skill-finally); Agent model = family words only (#110)
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]] — Anthropic cache breakpoints are Wisp-placed (two ephemeral markers, inbound cache_control stays ignored); removing them restores a ~10x plan-usage burn (#111, 2.0.10)
- [[2026-07-16-routing-cli-plus-slot-skill-not-mcp]] — Routing CLI + Slot skill, not MCP: `wisp routing` subcommands + sacrificial-Slot pattern; credential check warns, never refuses (spec #107)
- [[2026-07-16-providers-submenu-is-the-provider-hub-106]] — /providers submenu is the provider hub: Enter opens the row's actions (set active · key set/remove · OAuth sign in/out); slash commands stay (#106, 2.0.9)
- [[2026-07-16-typescript-7-native-compiler-upgrade]] — upgrade to TypeScript 7.0.2 (native Go compiler); any tsconfig consuming core's `src` must set `types:["node"]`
- [[2026-07-15-anthropic-door-must-honor-stream-false-model-validation]] — Anthropic door must honor `stream:false` (Claude Code `/model` validation is a non-streaming probe reading `usage.input_tokens`); shipped in `wisp-router@2.0.6`
- [[2026-07-15-catalog-ts-modularization-plan-deferred]] — catalog.ts modularization: 4-file peel EXECUTED 2026-07-16 (shared/codex/anthropic/xai, catalog 1293→486); someday-9 split still deferred
- [[2026-07-15-grok-xai-oauth-provider-shipped-live-verified]] — Grok (xAI OAuth) provider SHIPPED + live-verified: #92–#97 merged, #98 release-prep in PR #105; proxy `x-grok-*` headers confirmed
- [[2026-07-15-grok-xai-oauth-provider-planned-epic-91]] — Grok (xAI OAuth) provider planned: 4th kind `xai-oauth`, epic #91 / slices #92–#98, target 2.0.5
- [[2026-07-15-87-88-fix-landed-anthropicstream-guards-content-less-turns-streaming]] — #87/#88 fix landed: anthropicStream guards content-less turns; streaming max_tokens = model ceiling
- [[2026-07-15-diagnosis-claude-wisp-empty-or-malformed-response-http-200-is-our-end]] — Diagnosis: claude-wisp "empty or malformed response (HTTP 200)" is our end (tickets #87/#88)
- [[2026-07-15-alias-only-model-list-defaults-on-spec-78-ticket-81]] — Alias-only model list defaults ON (spec #78, ticket #81)
- [[2026-07-14-release-delivery-one-dispatcher-binary-scoped-platform-packages]] — Release delivery: one dispatcher binary, scoped platform packages, release-download fallback (#67)
- [[2026-07-14-routing-map-edits-are-pure-core-fns-refusal-undefined-65-pr-77]] — Routing map edits are pure core fns; refusal = undefined (#65 / PR #77)
- [[2026-07-14-claude-wisp-launcher-execution-details-64-pr-76]] — claude-wisp launcher execution details (#64 / PR #76)
- [[2026-07-14-both-faces-host-the-bridge-a-port-collision-fails-loud-63-pr-75]] — Both faces host the Bridge; a port collision fails loud (#63 / PR #75)
- [[2026-07-14-test-is-explicit-target-only-failures-are-the-backends-own-words-62]] — /test is explicit-target-only; failures are the backend's own words (#62 / PR #74)
- [[2026-07-14-oauth-managers-live-in-core-active-signed-in-61-pr-73]] — OAuth managers live in core; active ≠ signed-in (#61 / PR #73)
- [[2026-07-14-tui-mvp-execution-details-60-pr-72]] — TUI MVP execution details (#60 / PR #72)
- [[2026-07-14-panel-stays-two-full-faces-over-one-backend-66-cancelled]] — Panel stays: two full faces over one backend (#66 cancelled)
- [[2026-07-14-wisp-home-store-execution-details-59-pr-71]] — Wisp home store execution details (#59 / PR #71)
- [[2026-07-14-monorepo-execution-details-58-pr-70]] — Monorepo execution details (#58 / PR #70)
- [[2026-07-14-wisp-tui-arc-prd-57]] — Wisp TUI arc (PRD #57)
- [[2026-07-14-door-vision-tool-result-images-hoist-into-the-turns-images]] — Door vision: tool_result images hoist into the turn's images[]
- [[2026-07-13-bridge-routing-map-fixed-families-exact-aliases-no-patterns]] — Bridge Routing map: fixed families + exact aliases, no patterns
- [[2026-07-13-oauth-model-lists-caps-go-live-from-models-dev]] — OAuth model lists + caps go live from models.dev
- [[2026-07-13-the-door-honors-claude-codes-effort-reverses-the-panel-effort-only]] — The door honors Claude Code's /effort (reverses the "panel effort only" deferral)
- [[2026-07-13-the-bridge-door-forwards-codex-tools-strict-false-external-toolsets]] — The Bridge door forwards Codex tools `strict:false` (external toolsets can't be strict-coerced)
- [[2026-07-13-gate-44-verdict-picker-filters-plain-ids-claude-wisp-aliases-inbound]] — Gate #44 verdict: picker filters plain ids → `claude-wisp-*` aliases + inbound strip
- [[2026-07-13-bridge-anthropic-door-claude-code-as-a-bridge-consumer-prd-43-slices]] — Bridge Anthropic door: Claude Code as a Bridge consumer (PRD #43, slices #44–#47)
- [[2026-06-24-copilot-cli-shows-the-real-model-name-via-active-provider-routing]] — Copilot CLI shows the real model name, via active-Provider routing fallback (#b)
- [[2026-06-24-anthropic-over-the-bridge-40]] — Anthropic over the Bridge (#40)
- [[2026-06-24-bridge-39-built-codex-over-the-bridge-pure-reuse-of-the-lm-chat]] — Bridge #39 built: Codex over the Bridge (pure reuse of the LM Chat Provider's Responses path)
- [[2026-06-24-bridge-38-built-panel-control-generated-secret-copilot-env-injection]] — Bridge #38 built: panel control + generated secret + COPILOT_* env injection
- [[2026-06-24-bridge-37-built-the-http-listener-keyed-walking-skeleton-live-verified]] — Bridge #37 built: the HTTP listener + keyed walking skeleton (live-verified)
- [[2026-06-24-bridge-36-built-the-pure-protocol-translator-trust-boundary-guards]] — Bridge #36 built: the pure protocol translator (+ trust-boundary guards from review)
- [[2026-06-24-bridge-35-vs-code-copilot-cli-env-var-passing-gate]] — Bridge #35: VS Code → Copilot CLI env-var passing (gate)
- [[2026-06-23-the-bridge-an-outward-facing-local-openai-compatible-endpoint-prd-34]] — The Bridge: an outward-facing local OpenAI-compatible endpoint (PRD #34, slices #35–#40)
- [[2026-06-23-anthropic-max-effort-picker-mirrors-the-first-party-effort-slider-32]] — Anthropic `max` effort + picker mirrors the first-party `/effort` slider (#32)
- [[2026-06-23-anthropic-thinking-effort-parity-slice-31-branch-feat-anthropic]] — Anthropic thinking/effort parity (slice "#31", branch `feat/anthropic-thinking-effort`)
- [[2026-06-23-anthropic-tool-calling-parity-slice-30-the-toolcalling-flag-is-now]] — Anthropic tool-calling parity (slice #30); the toolCalling flag is now honest
- [[2026-06-23-anthropic-native-chat-streaming-slice-29-model-spec-1m-caps-effort]] — Anthropic native chat streaming (slice #29); model-spec 1M caps; effort deferred
- [[2026-06-23-anthropic-tracer-built-slice-28-the-live-429-resolved-the-recognition]] — Anthropic tracer built (slice #28); the live 429 resolved the recognition contract
- [[2026-06-22-anthropic-oauth-provider-prd-27-scope-architecture-accepted-risk]] — Anthropic OAuth Provider (PRD #27): scope, architecture, accepted risk
- [[2026-06-21-codex-effort-label-slice-25-prd-23-complete]] — Codex Effort label (slice #25); PRD #23 complete
- [[2026-06-21-codex-effort-built-slice-24-scale-widened-to-include-xhigh]] — Codex Effort built (slice #24); scale widened to include `xhigh`
- [[2026-06-20-codex-effort-control-prd-23]] — Codex Effort control (PRD #23)
- [[2026-06-19-released-v1-1-0-reposition-wisp-as-a-copilot-harness-model-router]] — Released v1.1.0; reposition Wisp as a Copilot-harness model router
- [[2026-06-19-codex-tool-calling-parity-slice-15-the-toolcalling-flag-is-now-honest]] — Codex tool-calling parity (slice #15): the toolCalling flag is now honest
- [[2026-06-19-codex-in-native-chat-slice-14-visible-streaming-on-real-caps-vision]] — Codex in native chat (slice #14): visible + streaming, on real caps + vision
- [[2026-06-19-codex-tracer-built-slice-13-live-round-trip-resolved-the-request]] — Codex tracer built (slice #13); live round-trip resolved the request contract
- [[2026-06-18-zen-go-split-built-slice-12-keyid-shared-credential-added]] — Zen/Go split built (slice #12); keyId shared-credential added
- [[2026-06-18-opencode-zen-go-split-rename-id-add-the-real-zen]] — OpenCode Zen/Go split (rename id + add the real Zen)
- [[2026-06-18-codex-provider-supersede-the-no-oauth-adr-subscription-backed]] — Codex Provider: supersede the no-OAuth ADR (subscription-backed)
- [[2026-06-18-drop-the-context-guess-table-keep-the-vision-fallback-resolves-the]] — Drop the context guess table; keep the vision fallback (resolves the open question)
- [[2026-06-18-released-v1-0-0]] — Released v1.0.0
- [[2026-06-18-context-window-is-decomposed-into-input-output-display-correctness]] — Context window is DECOMPOSED into input+output (display correctness)
- [[2026-06-18-read-real-context-vision-live-from-models-dev-the-big-one]] — Read real context/vision LIVE from models.dev (the big one)
- [[2026-06-18-tool-calling-vision-passthrough-honest-capabilities]] — Tool calling + vision passthrough (honest capabilities)
- [[2026-06-18-lm-chat-provider-slice-7-built-hitl-gate-resolved]] — LM Chat Provider (slice #7) built; HITL gate resolved
- [[2026-06-17-edit-blocks-built-slice-8-exact-match-fails-safe-extractedittext]] — Edit blocks built (slice #8): exact match, fails safe; extractEditText retired
- [[2026-06-17-inquire-edit-fidelity-search-replace-edit-blocks-supersedes-whole]] — Inquire edit fidelity: SEARCH/REPLACE edit blocks (supersedes whole-file rewrite)
- [[2026-06-17-completion-removed-slice-5-lands-the-pivots-one-way-step]] — Completion removed (slice #5 lands the pivot's one-way step)
- [[2026-06-17-scope-pivot-remove-completion-evolve-inquire-into-an-inline-chat]] — Scope pivot: remove Completion, evolve Inquire into an inline-chat editor
- [[2026-06-16-extract-pure-cores-to-a-vscode-free-module-vitest-for-unit-tests]] — Extract pure cores to a vscode-free module + Vitest for unit tests
- [[2026-06-15-multi-provider-a-provider-catalog-config-only-api-key-openai]] — Multi-provider: a Provider catalog (config-only, API-key, OpenAI-compatible)
- [[2026-06-15-rebrand-to-wisp-product-provider-split-issue-3]] — Rebrand to Wisp; product / provider split (Issue 3)
- [[2026-06-15-inquire-built-spike-confirmed-resolves-the-2026-06-14-unproven-risk]] — Inquire built; spike confirmed (resolves the 2026-06-14 unproven risk)
- [[2026-06-14-inquire-a-manual-whole-file-insertable-code-suggestion-new-feature]] — Inquire: a manual, whole-file, insertable-code suggestion (new feature)
- [[2026-06-10-panel-activity-indicator-via-a-dedicated-activity-message]] — Panel activity indicator via a dedicated `activity` message
- [[2026-06-10-comment-line-clunk-deterministic-guard-not-prompt-only]] — Comment-line clunk: deterministic guard, not prompt-only
- [[2026-06-10-uncapped-tokens-strip-reasoning-corrects-decision-2]] — Uncapped tokens + strip reasoning (corrects decision #2)
- [[2026-06-10-bare-model-ids-required-corrects-decision-5]] — Bare model ids required (corrects decision #5)
- [[2026-06-10-side-panel-implementation-post-review]] — Side-panel implementation (post-review)
- [[2026-06-10-side-panel-feature-planned]] — Side-panel feature (planned)
- [[2026-06-10-inline-completion-design-review]] — Inline-completion design review

## Related

- [[overview]]
- [[oauth-recon]]
