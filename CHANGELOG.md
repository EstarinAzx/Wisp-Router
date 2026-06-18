# Changelog

All notable changes to **Wisp** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/EstarinAzx/BYOK-IDE-Auto-Complete/releases/tag/v1.1.0
[1.0.0]: https://github.com/EstarinAzx/BYOK-IDE-Auto-Complete/releases/tag/v1.0.0
