# Changelog

All notable changes to **Wisp** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
