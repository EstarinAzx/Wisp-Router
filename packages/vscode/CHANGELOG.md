# Changelog

All notable changes to **Wisp** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.8] - 2026-09-08

### Added

- The extension-hosted Bridge includes exact Codex model routes from the shared Routing map.
  Provider ids and Aliases take precedence; missing Targets fail explicitly and Codex routes
  do not use Claude's cooldown fallback. Routes update live from the shared Wisp home.

### Surfaces

- **VS Code: 1.13.8**, a locally prepared companion to **wisp-router 2.1.5**. The terminal
  package supplies `codex-wisp`, additive picker Aliases and the Codex routing commands/TUI.
- Updating the extension-hosted Bridge requires installing this VSIX and reloading the host.
  Bundle inspection and compilation do not establish installed VS Code acceptance.
- **wisp-slot: unchanged.** Traycer GUI integration remains **NOT VERIFIED**; this VSIX does
  not add Wisp Aliases to Traycer. Publication and installation are separate actions.

## [1.13.7] - 2026-09-08

### Added

- The extension-hosted Bridge accepts native Codex Responses requests, including supported
  text, images, tools and visible conversation history. Unsupported content and controls
  fail explicitly; see the [Codex compatibility guide](../../docs/codex-wisp.md).
- Responses streaming preserves complete final text, real usage, failure and incomplete
  statuses, and cancellation across supported Provider paths.

### Surfaces

- **VS Code: 1.13.7** - bundles the same shared core as **wisp-router 2.1.4**. Install this
  VSIX and reload the extension to update its hosted Bridge.
- The `codex-wisp` launcher is delivered by the terminal/npm package, not by the extension.
- **wisp-slot: unchanged.**

## [1.13.6] ? 2026-09-07

### Fixed

- The hosted Bridge preserves Claude Code's validated conversation ID for Codex requests, keeping
  independent sessions separate and falling back to per-request IDs when metadata is unavailable.
- Codex preserves later system notes as ordered developer messages, so adding a note does not rewrite
  the opening instructions. The shared body builder keeps other providers' existing behavior.

### Surfaces

- **VS Code: 1.13.6** ? bundles the same core fixes as **wisp-router 2.1.2**.
- **wisp-slot: unchanged.**

## [1.13.5] — 2026-09-06

### Added

- Codex model and effort pickers use the signed-in account's catalogue, including unfamiliar names and
  variants. Refresh actions are available in the main model card and Codex routing rows; routing inputs
  also accept a manually entered model id while showing discovered suggestions.
- Account-scoped discovery cache shared with the terminal and Bridge; refresh on use after 15 minutes.

### Fixed

- Native chat, Inquire, and the hosted Bridge use discovered reasoning support, image capability and
  context windows. Codex's `max` effort is no longer silently reduced to `xhigh`.
- Claude Code's `max` stays `max` on supporting models; unsupported effort values use the model's
  advertised default. Codex's Ultra orchestration mode is excluded from ordinary reasoning choices.

### Surfaces

- **VS Code: 1.13.5** — this extension bundles the core changes also carried by **wisp-router 2.1.1**.
- **wisp-slot: unchanged.**

## [1.13.4] — 2026-09-04

Two engine fixes, carried here because the extension **bundles its own copy of `@wisp/core`** — no
`wisp-router` release can deliver them to a picker or native-chat user. Cut alongside npm
`wisp-router` 2.1.0, which carries the same two changes to the terminal face.

### Fixed

- **A deterministic Antigravity client error answers with its real status instead of a 502.** A 502 tells
  the client "the server broke, retry", so a request that could never succeed — a 400 from a rejected tool
  schema, a 401 from an expired token — was retried instead of surfaced. A 400 / 401 / 403 / 404 now
  answers with that status and the matching error type, carrying the upstream detail. 5xx stays a gateway
  condition on purpose, and 429 keeps its own classifier.
- **The Bridge's cache-health log names the known Fable backend re-bill instead of calling it a real history
  re-bill.** On `claude-fable-5-1` the "prior write not read back" stall is the backend re-billing a slice of
  its own thinking, not a Wisp cache break — Opus 5 on the same session reads back exactly. On a
  Fable/Mythos-family model the line now says so rather than sending the user to chase breakpoints.
  Log-only.

## [1.13.3] — 2026-09-04

One engine fix, carried here because the extension **bundles its own copy of `@wisp/core`** — no
`wisp-router` release can deliver it to a picker or native-chat user. Cut alongside npm
`wisp-router` 2.0.48, which carries the same change to the terminal face.

### Fixed

- **An Antigravity turn no longer fails whenever a tool declares an array without saying what is in it.**
  The upstream rejects an `ARRAY` schema node that carries no `items`, and rejects the entire request with
  it, so a single such tool took down every Antigravity turn in a session at any model. A bare
  `{"type":"array"}` is ordinary JSON Schema for "array of anything", and a 2020-12 `prefixItems` tuple
  degrades into one because this wire ignores that keyword. Such a node now gets
  `items: {"type":"string"}`. Established by driving the wire per shape, and proven on the same model in
  the same minute: the reported shape answers 400 raw and 200 through the cleaner.

## [1.13.2] — 2026-09-03

Three engine fixes, carried here because the extension **bundles its own copy of `@wisp/core`** — no
`wisp-router` release can deliver them to a picker or native-chat user. Cut alongside npm
`wisp-router` 2.0.47, which carries the same three changes to the terminal face.

### Fixed

- **A bridged Claude Code session on a Claude-5 model stops re-billing its whole history every turn.**
  The volatile `<system-reminder>` tail Claude Code appends mid-session sat in the top-level `system`
  array, inside the cached prefix of every message-level breakpoint (render order `tools → system →
  messages`). Each reminder change missed all of them and re-billed the whole conversation as
  `cache_creation`. It now rides as a trailing `role:"system"` turn behind every breakpoint on models
  that accept one (Opus 5, Opus 4.8, the Fable and Mythos 5 families); Sonnet and Haiku 400 on a
  positioned system turn, so there it keeps its previous placement, unchanged. Reproduced and fixed on
  the live wire before shipping. (#363)
- **A real cache re-bill is no longer hidden by a "STALE" diagnosis.** A server cache diagnosis the bill
  contradicted used to suppress the whole cache-health heuristic, so a genuine per-turn re-bill logged as
  "not a real miss". A STALE verdict now falls through to the heuristic; only a non-stale server MISS
  suppresses it. Log-only. (#156/#162)
- **A turn that reports no quota headers no longer blanks the statusline's quota block.** The active
  Provider was evicted from the quota ledger unconditionally; the eviction is now gated on the turn
  actually carrying meters, so an unmetered response keeps the last reading as the fallback. (#204)

## [1.13.1] — 2026-09-02

A single fix, carried here because the extension **bundles its own copy of the engine** — no
`wisp-router` release can deliver it to a picker or native-chat user. Cut alongside npm
`wisp-router` 2.0.46, which carries the same change to the terminal face.

### Fixed

- **A Claude model newer than the version Wisp claims to be no longer fails.** The subscription
  backend enforces the advertised `claude-cli` version as a **per-model floor**. `claude-fable-5-1`
  released 2026-09-01 and demands 2.1.251; the extension had been claiming 2.1.219 since 2026-07-25,
  so picking the new model answered `400 claude_code_version_too_old` behind a 502. Wisp now
  advertises 2.1.258, the shipping CLI. Verified on the live wire at both versions with
  `claude-opus-5` at the old version as a must-pass control, and with the `anthropic-beta` token list
  unchanged — the floor is the advertised version alone, no beta was implicated.

Model discovery was never at fault: the dropdown is pulled live with no family whitelist, so the new
model appeared on release day. Only the client fingerprint failed to keep up.

npm `wisp-router` 2.0.46 additionally fixes the terminal's one-tap "Bind Claude subscription models"
button, which had gone on binding `fable` to the older `claude-fable-5`. That button is TUI-local and
has no counterpart here, so this bundle carries the version pin alone.

## [1.13.0] — 2026-08-14

**The extension's Bridge honours `/effort` on Antigravity's tiered models.** The Antigravity arm of the
Bridge door took no effort value at all, so a Claude Code turn ran at whatever depth the model id
implied regardless of the effort level it asked for. On a `-tiered` row the level now rides as
`generationConfig.thinkingConfig.thinkingLevel`; on every other row nothing changes, because those ids
already pin their depth in the name and the flat picker means choosing the row chose the tier.
`xhigh` and `max` fold onto this wire's top stop, `high`. npm `wisp-router` 2.0.45 is the terminal half
of the same change; this is the half npm can never deliver, because the extension **bundles its own
copy of `@wisp/core`**.

## [1.12.0] — 2026-08-14

**The Antigravity dropdowns go live.** 1.11.0 shipped the Provider with a thirteen-model snapshot
frozen into the bundled `@wisp/core`; a model Antigravity released after that snapshot never reached
the panel. Signed in, the model picker and the Routing-map rows now ask the upstream's own
model-discovery route (`POST /v1internal:fetchAvailableModels`, same hosts and headers as a turn) and
show what it answers. The fetch is raced against the same 4-second ceiling as the models.dev lookups,
so a slow upstream can never stall panel open; signed out, timed out, or on any error the dropdowns
fall back to the static table — never empty, never a throw. npm `wisp-router` 2.0.44 is the terminal
half of the same change.

## [1.11.0] — 2026-07-30

**Antigravity reaches the extension face.** npm `wisp-router` 2.0.41 carried the new Provider to the
terminal face on 2026-07-30; this is the half npm can never deliver, because the extension **bundles
its own copy of `@wisp/core`** — and this face is not a bystander: the extension hosts a Bridge and a
side panel of its own, and both were wired for Antigravity in #188 and #189. Cut as #197, the bump
the 2.0.41 release cut recorded as owed. (Spec #185, tickets #187–#191)

### Added

- **The Antigravity Provider (#187–#191).** A Google Cloud Code wire, reached with a browser OAuth
  sign-in rather than an API key. Thirteen Gemini models with per-model output caps appear in the
  **model picker, native chat and Inquire**; the image-generation row is refused up front, by name,
  rather than failing somewhere inside a stream. **Sign-in happens in the terminal**, not the panel:
  run `wisp` → `/signin antigravity` and approve in the browser. Both faces share owner-only
  `~/.wisp/auth.json`, so the extension's row lights up once approved — the same posture as Kimi, and
  deliberately so: the panel shows a truthful signed-in status and points at the command rather than
  offering a button it cannot run.
- **The extension's own Bridge answers for it (#189, #191).** The extension constructs an
  `AntigravityAuth` so its Bridge can refresh the stored token bundle and bootstrap the Cloud Code
  project before a turn — the shape it already uses for Kimi — and passes `antigravitySignedIn` /
  `antigravityCreds` into its own `createBridgeServer`. A user who never installs the npm package
  still reaches Antigravity through both Bridge doors from the editor: the OpenAI door through the
  Provider's executor record, and the Anthropic door through its own per-kind chain — so Claude Code
  bridged through the extension runs on Gemini too. Tool calls carry the upstream's own call ids
  untouched; vision and documents ride the one attachment shape this wire takes.

### Fixed

- **A rate limit no longer leaves the extension-hosted Bridge as a `502` (#190).** No executor record
  classified anything, so a quota exhaustion was reported as a gateway fault — neither what happened
  nor actionable. The classification path in the bundled core is now live and door-neutral; Antigravity
  is the first Provider to use it, answering `429` with a cooldown horizon taken from what the server
  actually said. Other Providers are unchanged pending their own records; the widening is additive.

### Surfaces

- **The `wisp` vsix 1.11.0** (this release) — everything above: the #188/#189 extension wiring plus
  the full Antigravity Provider (#187–#191) in the bundled `@wisp/core`.
- **npm `wisp-router` 2.0.41** — already carries #187–#191 to the terminal face (TUI, `wisp serve`,
  and the `claude-wisp` launcher); published 2026-07-30, nothing further owed.
- **The `wisp-slot` Claude Code plugin** — untouched by #185, nothing owed. Stays at **1.6.0**.

## [1.10.1] — 2026-07-29

A single fix, carried here because the extension **bundles its own copy of the engine** — no
`wisp-router` release can deliver it to a picker or native-chat user. Cut alongside npm
`wisp-router` 2.0.40, which carries the same change to the terminal face.

### Fixed

- **A `~/.wisp` store that cannot be read is no longer destroyed (#182).** 1.10.0 fixed the commonest
  cause of an unreadable store — a byte-order mark (#181). This fixes what happens *whenever* a read
  fails for any other reason: a write interrupted by a crash, a truncated file, a typo from
  hand-editing. Both stores are read-merge-write, so a failed read did not mean "ignore the file", it
  meant **erase it**: the empty result was merged with your next change and written back over the real
  contents. Changing one setting wiped every family route; one sign-in wiped every stored API key and
  OAuth token.

  The write now refuses. A store holding content that could not be parsed is never overwritten — the
  operation fails with an error naming the file, and the file is left byte-for-byte as it was, so its
  contents remain recoverable. Reading stays permissive, so the extension still activates and still
  routes on defaults with a broken config; only saving over it is blocked until it is repaired or moved
  aside. A missing or empty store is not this case and still writes normally, so a first install is
  unaffected. (ADR-0004)

### Surfaces

- **The `wisp` vsix 1.10.1** (this release) — the fix above, in the bundled `@wisp/core`.
- **npm `wisp-router` 2.0.40** — the same fix for the terminal face, cut in the same pass. Both are
  tracked under #184.
- **The `wisp-slot` Claude Code plugin** — untouched by #182, nothing owed. Stays at **1.6.0**.

## [1.10.0] — 2026-07-29

Ships the **CLIProxyAPI harvest** (spec #164) to the extension. `wisp-router` 2.0.38 carried it to
npm on 2026-07-29; this is the half npm could never deliver, because the extension **bundles its own
copy of the engine** — a core fix reaches a picker or native-chat user only when the vsix is rebuilt.
See *Surfaces* at the end for what reaches where.

### Added

- **Kimi as a Provider (#170).** A Kimi Code subscriber can use that subscription through Wisp instead
  of buying separate API credit. The row appears in the **model picker, native chat and Inquire**, and
  the side panel shows its signed-in state. **Sign-in happens in the terminal**, not the panel: run
  `wisp` → `/signin kimi` and approve at the printed URL. Both faces share `~/.wisp/auth.json`, so it
  lights up here once approved — the panel points you there rather than offering a button that cannot
  run a device flow. ⚠ Kimi's auth host, client id and endpoints could not be verified offline; a wrong
  value fails loud at sign-in with the server's own words.
- **Live token usage on every bridged turn (#165, #169).** When the extension hosts the Bridge, Codex
  and Grok turns (#165) and every API-key Provider (#169) now report real usage instead of zeros. This
  is what lets Claude Code size auto-compaction on a bridged session — without it a conversation grew
  unchecked until the backend refused it. Verified live: 7/7 Codex turns and 2/2 keyed turns reporting.

### Fixed

- **A fresh Codex sign-in no longer sends a model the account path refuses (#172).** The codex row's
  default was `gpt-5.3-codex`, which a ChatGPT account is answered `400 … not supported when using
  Codex with a ChatGPT account` for — so signing in and using native chat **without opening the model
  picker** failed on the first turn. The default is now `gpt-5.6-sol`. `gpt-5.3-codex` remains valid
  for API-key callers and stays in the dropdown: this is an account-path restriction, not a
  model-existence one.
- **A BOM in `~/.wisp/config.json` or `auth.json` no longer destroys it (#181).** A UTF-8 byte-order
  mark — what Notepad and PowerShell's `Out-File -Encoding utf8` write **by default** — made the file
  unparseable, and the stores are read-merge-write: the empty result was merged with the next change
  and **written back over the real file**. Hand-editing your config and later changing one setting
  erased every family route; the same path on `auth.json` plus one sign-in erased every stored API key
  and OAuth token, silently and with no error at any point. A BOM is valid UTF-8 and is now tolerated.
- **A usage event can no longer be mistaken for a tool call in native chat (#165).** The Codex, Grok
  and Anthropic chat paths read "not text" as "must be a tool call"; the new usage events now fall out
  explicitly instead of reaching that branch.
- **Failed bridged turns answer with a real status, and transient ones retry (#166, #167, #168).**
  Codex failures are classified into their actual conditions rather than a blanket
  `502 provider request failed` (a 502 tells the client to retry, which for an over-window conversation
  only makes it worse); pre-stream failures are no longer locked into an empty `200`; and a stream that
  dies before delivering anything is retried once with backoff, with a repeatedly-failing provider
  briefly cooled off.

### Changed

- **The statusline snapshot is written whichever face hosts the Bridge (#171).** The extension now
  passes `recordStatus` into its Bridge deps, so `~/.wisp/status.json` is written after each bridged
  turn on the Anthropic door here too — not only under `wisp serve`. Reading it back is the
  `wisp-slot` plugin's job; see *Surfaces*.

### Surfaces

- **This vsix (1.10.0)** — everything above. The Kimi row, the corrected Codex default, the native-chat
  usage-event guard and the BOM fix reach a picker / native-chat / Inquire user **only** through this
  build.
- **npm `wisp-router`** — carried the engine half in **2.0.38**. ⚠ **#181's BOM fix is NOT in 2.0.38**;
  it landed after that cut and ships on npm in the next one. Until then, `wisp serve` / `claude-wisp`
  users still have the destructive behaviour.
- **The `wisp-slot` Claude Code plugin (1.6.0)** — bumped alongside this release. It carries the
  *reader* half of #171: without it the Bridge writes `status.json` and no `ctx …%` ever appears on the
  badge.

## [1.9.0] — 2026-07-28

Catches up with the TUI line (wisp-router 2.0.32–2.0.37) — Opus 5, `[1m]` tier
handling, usage-limit auto-cooldown, cache-advisory sharpening, truncation
honesty — plus an extension-only fix to the Codex picker windows.

### Added

- **Opus 5 support** (wisp-router 2.0.36). `claude-opus-5` joins the effort ladder +
  xhigh/max sets via a family-version regex (a suffixed `claude-opus-5[1m]` matches too),
  leads the offline fallback list, and becomes the anthropic row's default model.
  `CLAUDE_CODE_VERSION` 2.1.216 → 2.1.219.
- **Auto-cooldown + family fallback on usage-limit 429 (#161)** (2.0.34). A provider
  answering `429 usage_limit_reached` is marked cooling until its reset horizon;
  family-matched `claude-*` routes fall back to the anthropic Provider meanwhile.

### Fixed

- **Codex models advertise their real context windows.** The picker's offline caps
  fallback pinned every gpt-5.x Codex model at 400K input / 32K output — numbers captured
  before the gpt-5.4+ flagships (including the 5.6 sol/terra/luna trio) shipped their
  1.05M-context / 128K-output window. The fallback now tiers by family (flagship
  1.05M/128K, `-codex`/`-mini` 400K/128K, spark 128K/32K, o-series 200K/100K), and the
  live models.dev lookup — which now carries the Codex ids — wins whenever the catalog is
  loaded. Display metadata only: the Bridge never trims a conversation to the advertised
  window, so an over-window request is still rejected upstream (the 502 passthrough).
- **A truncated turn now says so** (2.0.37). The Anthropic door carries upstream's
  cut-short reason (`max_tokens` / `content_filter` / `refusal`) into the reply's
  `stop_reason` instead of flattening it to `end_turn`/`tool_use`, and the visible
  `_[Response truncated…]_` marker is gated on answer text so a thinking-only refusal
  isn't rendered as an empty turn. VS Code native chat keeps the marker unconditionally —
  a chat part has no `stop_reason` channel.
- **A `[1m]`-suffixed Target no longer 502s** (2.0.36). The harness-local tier suffix is
  stripped at the wire seam; routing, logs, caps and the effort gate keep reading the id
  as typed.
- **Cache-advisory sharpening (#156, #158, #159, #162)** (2.0.32–2.0.35). Stale server
  miss verdicts log as advisory rather than MISS, the diagnosis chain keys per
  cache-prefix variant, the STALE line states the observable, and PARTIAL no longer flags
  healthy incremental growth.

## [1.8.0] — 2026-07-21

The Bridge's Anthropic door catches up with the TUI line (wisp-router 2.0.11–2.0.31):
Advisor, a prompt-cache health overhaul, and server-side cache diagnostics.

### Added

- **Server-side cache diagnostics on the Anthropic OAuth path (#156).** Every OAuth
  Messages request rides the `cache-diagnosis-2026-04-07` beta and chains
  `diagnostics.previous_message_id`; when the backend diagnoses a broken cache prefix, the
  Bridge's MISS line reports the server's authoritative reason and re-billed magnitude.
  The usage heuristic stays as fallback, and a server `unavailable` answer reads as
  no-diagnosis, not a miss.
- **Claude Code's native Advisor works through the Bridge (#141–#143).** The door plays
  the advisor server role: it runs the reviewer over the conversation (quarantined
  system prompt, prompt-cacheable transcript), streams the verdict back, and reports
  reviewer cost via `usage.iterations` so `/cost` sees it.
- **Anthropic-door passthrough fidelity.** Thinking / redacted-thinking blocks, Claude 5
  effort, base64 PDF `document` blocks, `tool_result.is_error`, and real token usage off
  the wire (previously synthesized).
- **Prompt-cache observability.** `prompt-cache MISS` / `PARTIAL` advisory log lines on
  the Anthropic door (#111, #146).

### Fixed

- **Prompt-cache health overhaul on the Anthropic door (#111, #139, #145).** Fixed cache
  TTL per request path (no mid-session flip), breakpoints spread across fat tool turns,
  1h TTL on bridge sessions, and the hook-reminder re-bill amplifier removed. Measured
  miss rate ~1/392 turns — better than native claude-cli (~1/70).
- **Claude Code `/model <alias>` no longer crashes validating a Wisp model.** The Bridge's
  Anthropic door ignored `stream: false` and always replied with an SSE stream; Claude Code's
  model-validation probe is a non-streaming request whose JSON body it reads `usage.input_tokens`
  from — so it failed with `undefined is not an object (evaluating 'B.usage.input_tokens')`. The
  door now honors `stream: false` with a proper JSON Messages reply (carrying a `usage` block), so
  `/model` selection — and assigning a Wisp alias to a subagent — works.

## [1.7.0] — 2026-07-15

Grok comes to the extension: sign in with a Grok subscription, no API key.

### Added

- **Grok (xAI OAuth) provider** — sign in with a Grok subscription (no API key) and reach
  `grok-build` (default) / `grok-composer-2.5-fast` / `grok-4.5` in native chat, the side
  panel, Inquire, and both Bridge doors. A Codex-twin on the Responses API; subscription
  models route the Grok-CLI proxy, `grok-4.5` goes direct to api.x.ai. Not to be confused
  with the existing **Groq** (Llama, API-key) provider. (#91)
- **`bridge.aliasOnlyModels`** setting (default off): Claude Code's `/model` list shows
  **only** the Routing-map Aliases — the Provider rows are hidden. A checkbox in the
  panel's Bridge section; the TUI's `/aliasonly` command flips the same flag. Anthropic
  door only (the OpenAI door keeps its full list). (#67)

## [1.6.0] — 2026-07-14

The Bridge Routing map: pin bridged model names to the backends you choose.

### Added

- **Routing map — Family routes.** Four fixed rows in the side panel's Bridge section
  (`opus` / `sonnet` / `haiku` / `fable`): a bridged `claude-*` id of that family answers
  with the row's **Target** — the picked Provider plus a pinned model — instead of the
  Active Provider. Unmapped rows keep today's behaviour. So Claude Code's own model names
  can fan out: opus traffic to a strong backend, haiku traffic to a cheap one. (#51)
- **Routing map — Aliases.** Invent exact bridged model names (e.g. `sol`) and point each
  at its own Target. Aliases are advertised in both doors' `GET /v1/models` — so they show
  up right in Claude Code's `/model` picker (as `claude-wisp-` rows) and in any
  OpenAI-dialect tool's model list — and a picked alias routes to its Target. Names that
  would shadow a Provider id are refused. (#52)
- **Routing map — per-row model dropdowns.** Every row's model field is a real dropdown
  listing the picked Provider's models: the models.dev catalog for the OAuth kinds, a live
  `/models` fetch (with that Provider's own key) for keyed kinds. When a list can't be
  fetched (offline, no key yet) the field falls back to free text — configuring a route is
  never blocked. (#53)
- **`wisp.bridge.aliasPickerShowsModel`** setting (default on): alias rows in Claude Code's
  `/model` picker carry their pinned model (`sol — gpt-5.6-terra`); also a checkbox in the
  panel. Claude Code re-reads the list on restart.

### Fixed

- **Images now cross the Bridge's Anthropic door.** Inbound image blocks were dropped on
  the way to the backend (the follow-up noted in 1.4.1); they are now forwarded end to end,
  with an inbound image-count log line for debugging.

## [1.5.0] — 2026-07-13

The Anthropic door: run **Claude Code** on your Wisp providers.

### Added

- **Bridge Anthropic door.** The Bridge now speaks Anthropic's Messages protocol alongside
  the OpenAI one: `POST /v1/messages` + Anthropic-flavored `GET /v1/models` on the same
  listener. Point **Claude Code** at the Bridge (`ANTHROPIC_BASE_URL` + the access secret)
  and every Wisp provider — including your **ChatGPT (Codex) subscription** — appears in
  Claude Code's own `/model` picker (as `claude-wisp-*` rows) and runs its coding tasks:
  streaming, full tool round-trips, per-request routing.
- **Claude Code setup snippets in the side panel.** With the Bridge running, the Bridge
  section offers ready-to-copy setup variants built from the live address + secret:
  per-session shell lines (PowerShell and bash) and a persistent project
  `.claude/settings.json` env block. No hand-typing, and no global `~/.claude` variant
  (it would silently reroute every Claude Code session).
- **Claude Code's `/effort` drives the backend.** The door reads the request's
  `output_config.effort` and forwards it to the provider, overriding the panel Effort
  (`max` folds to `xhigh` on Codex, whose wire tops out there). No effort on the request →
  the panel Effort applies, as before.

### Fixed

- **Bridge model lists no longer pin a frozen "· medium" onto Codex rows.** The effort
  suffix now appears only where a live effort value backs it (the in-VS-Code picker);
  Bridge discovery labels stay bare.
- **Mid-stream backend failures surface as a proper Anthropic `error` SSE event** instead
  of a truncated stream Claude Code reported as an empty/malformed response.
- **External toolsets forward to Codex non-strict.** Claude Code's rich tool schemas
  (dynamic maps like `AskUserQuestion`) can't be strict-coerced; the door now sends them
  `strict: false`. The native VS Code agent path keeps strict mode.

## [1.4.3] — 2026-07-06

### Fixed

- **DeepSeek agent-mode 400 on no-arg tools.** VS Code no-arg tools arrive with no
  `inputSchema`; `toOpenAiTools` defaulted it to a bare `{}`, which DeepSeek rejects.
  Now defaults to `{ type: "object", properties: {} }`, matching the Codex and Anthropic
  tool builders (backfilled — this entry was missing when v1.4.3 shipped).

## [1.4.2] — 2026-07-06

### Fixed

- **Codex replies no longer cut off silently.** On a long high-effort reasoning turn
  (e.g. `gpt-5.5 · high`) the streaming reply could stop with no text and no error — the
  socket dropped before any terminal event and the stream yielded nothing, rendering a
  blank turn. `codexStream` now guards the stream end: a truly-empty drop throws a
  retryable error, a drop after partial content keeps the content and flags the abrupt
  end, and a backend truncation (`response.incomplete`) surfaces a visible
  `[Response truncated: <reason>]` marker instead of vanishing. Mid-stream `error` frames
  and cancellations are no longer swallowed without a trace. See
  `CODEX-STREAM-CUTOFF-FINDINGS.md`.

## [1.4.1] — 2026-06-24

### Fixed

- **Anthropic vision in native chat.** Image attachments are now forwarded to Claude as
  Messages `image` content blocks. The provider advertised vision but silently dropped
  attached images, so Claude saw an empty message. The Bridge path still drops images
  (separate follow-up).

### Changed

- The Anthropic provider is now labelled **Anthropic** (was "Claude") in the side-panel
  dropdown and the native-chat model picker — it is a provider name, not a model.

## [1.4.0] — 2026-06-24

The Bridge (experimental): run external tools on your Wisp providers.

### Added

- **Bridge — an OpenAI-compatible endpoint for your providers (experimental).** A local
  listener on `127.0.0.1` exposes the same backends *outward* as one ordinary OpenAI API,
  so external tools — notably the **GitHub Copilot CLI** — can run on your Wisp providers,
  including your **ChatGPT (Codex)** and **Claude.ai** subscriptions. Toggle it from the
  side panel or **`Wisp: Toggle Bridge`**; every request needs the generated **access
  secret** as a Bearer. Serves `GET /v1/models` and `POST /v1/chat/completions` (streaming
  or not), routing by provider id and falling back to the Active Provider. (Issues #35–#40)
- **Zero-setup Copilot CLI.** Terminals opened after the Bridge starts inherit `COPILOT_*`
  environment variables that point the Copilot CLI straight at the Bridge.
- **`wisp.bridge.port`** setting (default `41184`, machine-scoped) for the listener port.

### Security

- The Bridge binds `127.0.0.1` only (never a public interface); the access secret is
  generated on start, stored in the OS keychain, and compared in constant time.

## [1.3.0] — 2026-06-23

Your Claude.ai subscription is now a first-class backend — sign in, no API key.

### Added

- **Anthropic provider — subscription Claude in chat + Inquire.** Sign in with your
  Claude.ai account (OAuth) and run Claude on your own Max/Pro/Team subscription — native
  Chat, Agent mode, and `Ctrl+I` Inquire, no API key. Tokens live in the OS keychain.
  (Issues #28, #29)
- **Tool calling / Agent mode for Claude.** Claude is first-class in Agent / Edit mode —
  parallel tool calls stream as sibling `tool_use` blocks, wired through the same chat
  surface as the other providers. (Issue #30)
- **Reasoning Effort for Claude.** The side-panel **Effort** knob now governs Claude too
  (shared with Codex): one global value driving every call — Inquire and chat alike — via
  adaptive thinking + `output_config.effort`. The picker mirrors the first-party Claude Code
  `/effort` slider with the full `low` → `medium` → `high` → `xhigh` → `max` ladder; each
  level clamps to the model's ceiling on the wire (so a Sonnet pick of `xhigh`/`max` runs at
  `high`, never errors), and `max` lands on the capable Opus models (4.6–4.8). (Issues #31, #32)

## [1.2.0] — 2026-06-21

Codex reasoning depth is now yours to set.

### Added

- **Codex Effort control.** A side-panel **Effort** knob (`low` / `medium` / `high` /
  `xhigh`) for the Codex provider sets the reasoning depth for **every** Codex call —
  Inquire and native chat alike — replacing the fixed `medium`. One global value, set it
  once. The active depth is mirrored in the model picker (`Codex — gpt-5.3-codex · high`)
  for reasoning-capable Codex models; inert variants (`*-spark`, `gpt-4.x`) show no depth.
  (Issue #23)

## [1.1.0] — 2026-06-19

Wisp grows into a **model router for VS Code's Copilot chat harness**: bring your own
backends — including your ChatGPT subscription — into native Chat, Agent mode, and
`Ctrl+I`, with full tool calling.

### Added

- **Codex provider — your ChatGPT subscription as a model.** Sign in with a ChatGPT
  account (OAuth) and run OpenAI's Codex models on your own subscription via the
  Responses API, on both surfaces (native chat + Inquire). No API key. Imports an
  existing Codex CLI login (`~/.codex/auth.json`); tokens live in the OS keychain.
  (Issues #11, #13)
- **Codex in native chat + agent mode.** Codex streams in the chat / `Ctrl+I` picker
  with real context windows (gpt-5.x 400K, o-series 200K) and vision, and — as of this
  release — **tool calling**, so Codex is first-class in Agent / Edit mode. (Issues #14, #15)
- **OpenCode Go / OpenCode Zen split.** The two OpenCode endpoints are now distinct
  providers (`/zen/go/v1` vs `/zen/v1`); they share one OpenCode key via `keyId`. The
  catalog is 11 built-ins + Custom. (Issue #12)

### Changed

- **Repositioned as a router.** README and product framing now lead with routing your own
  models into the Copilot chat harness; Inquire is the secondary inline-edit feature.

### Security

- Codex OAuth tokens are stored in SecretStorage; sign-out writes a tombstone so a Codex
  CLI login is not silently re-imported.

## [1.0.0] — 2026-06-18

First stable release. Wisp is now an inline-edit assistant (**Inquire**) backed by a
catalog of OpenAI-compatible providers, and it also exposes those providers as models
in VS Code's **native** chat.

### Added

- **Language Model Chat Provider.** Wisp registers its keyed providers as selectable
  models in VS Code's native chat / `Ctrl+I` picker (vendor `wisp`), streaming through
  Wisp's own OpenAI-compatible client. (Issue #7)
- **Tool calling.** Agent tools are forwarded to the backend and streamed tool calls are
  emitted back, so Wisp models are first-class in agent/edit/`Ctrl+I` (which hide models
  without tool support).
- **Vision.** Image attachments are forwarded as data URIs for multimodal models.
- **Live model capabilities from [models.dev](https://models.dev).** Each model's real
  context window and vision support are read live (cached, with graceful fallback) instead
  of being hardcoded — so the picker shows accurate, per-model numbers that track model
  switches.
- **Multi-provider catalog.** Nine built-in providers (OpenCode Zen, OpenAI, Groq,
  Mistral, OpenRouter, Ollama, Ollama Cloud, KiloCode, Cline) plus a user-defined Custom
  endpoint, each with its own key and remembered model. (Issues 4–7)
- **Side panel** for key/provider/model management with a thinking/idle activity indicator.
- **First test runner** — pure provider-catalog and capability helpers extracted to a
  vscode-free module under Vitest (`npm test`).

### Changed

- **Inquire is now an inline-edit editor.** Describe an edit; the model returns
  SEARCH/REPLACE blocks applied as an in-editor diff with Accept/Reject CodeLenses —
  replacing the whole-file suggestion flow. (Slices 1–3)
- **Minimum VS Code raised to 1.104** (the Language Model Chat Provider API is finalized
  there).
- Rebranded the product to **Wisp** (Wisp = the product; OpenCode Zen = a provider).

### Removed

- **Always-on ghost-text Completion** and its enable toggle — Wisp is Inquire-only.

### Security

- Built-in provider base URLs are hardcoded and machine-scoped; only the Custom provider
  uses a user-supplied URL, so a workspace cannot redirect an API key to another endpoint.
- API keys live in the OS keychain (SecretStorage), never in plaintext settings.

## [0.0.x] — pre-1.0

Early development: initial OpenCode-backed completion extension, side-panel activity
indicator (`v0.0.3`), and the first manual whole-file suggestion (Inquire).

[1.1.0]: https://github.com/EstarinAzx/Wisp/releases/tag/v1.1.0
[1.0.0]: https://github.com/EstarinAzx/Wisp/releases/tag/v1.0.0
