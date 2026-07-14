<p align="center">
  <img src="docs/wisp.png" alt="Wisp" width="560">
</p>

<p align="center">
  <strong>BYOK model router — run the model access you already pay for, everywhere you code.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wisp-router"><img src="https://img.shields.io/npm/v/wisp-router" alt="npm version"></a>
  <a href="https://github.com/EstarinAzx/Wisp-Router/releases"><img src="https://img.shields.io/github/v/release/EstarinAzx/Wisp-Router" alt="GitHub release"></a>
</p>

---

## What is Wisp

Wisp routes your own model backends — your **ChatGPT (Codex) subscription**, your **Claude.ai subscription** (both via OAuth, no API key), or any OpenAI-compatible API key (OpenAI, Groq, Mistral, OpenRouter, Ollama, and more) — into the tools you already code with:

- **VS Code** — providers show up as native models in Copilot's **Chat view**, **Agent mode**, and the **`Ctrl+I`** picker, with streaming, tool calling, vision, and live per-model context windows.
- **Claude Code & Copilot CLI** — the **Bridge** exposes the same providers as a local endpoint speaking two dialects (OpenAI `/v1/chat/completions` + Anthropic `/v1/messages`); the `claude-wisp` bin launches Claude Code already wired to it.
- **Terminal** — the **Wisp TUI** manages providers, keys, OAuth sign-ins, and routing, and hosts the Bridge headlessly (`wisp serve`).

The OAuth part is the reason Wisp exists: VS Code's built-in "add a custom model" BYOK stops at static API keys — it can't sign in to a ChatGPT or Claude.ai subscription. Wisp can.

## Install

### TUI + Bridge + Claude Code launcher (npm)

```sh
npm i -g wisp-router   # bins: wisp + claude-wisp — compiled per-platform binaries, no Bun/Node runtime needed
wisp                   # the TUI: providers, keys, sign-ins, routing, /bridge
wisp serve             # headless Bridge (no UI, Ctrl+C stops)
claude-wisp            # launch Claude Code routed through the Bridge
```

### VS Code extension

Not on the Marketplace — download the `.vsix` from [Releases](https://github.com/EstarinAzx/Wisp-Router/releases), then **Extensions → ⋯ → Install from VSIX…**. Full walkthrough (quickstart, providers, Bridge, security) in the [extension README](packages/vscode/README.md).

## Highlights

- **12 built-in providers + Custom**, in three kinds: API-key (OpenAI-compatible), **Codex** (ChatGPT OAuth, Responses API), and **Anthropic** (Claude.ai OAuth, Messages API).
- **First-class in the Copilot harness** — streaming, tool calling (which is what makes a model selectable in Agent/Edit modes), vision attachments, a reasoning **Effort** knob, and live context windows from [models.dev](https://models.dev).
- **Bridge** — a local (`127.0.0.1`-only) endpoint guarded by a generated secret, speaking both the OpenAI and Anthropic dialects, so external tools run on your providers.
- **Routing map** — pin Claude Code's `opus` / `sonnet` / `haiku` / `fable` model families to any backend, or invent **aliases** (`/model sol`) pointing at exact provider+model targets; an alias-only mode keeps the `/model` picker clean.
- **Inquire** (VS Code) — inline natural-language code edits: the model returns SEARCH/REPLACE blocks, applied as an accept/reject diff, fail-safe.
- **One shared home** — both faces read `~/.wisp/` (`config.json` + owner-only `auth.json`); keys and tokens never live in VS Code settings.

## Repository layout

Bun-workspaces monorepo — three packages, one root `bun.lock`.

| Package | What |
|---|---|
| [`packages/core`](packages/core) | The engine: Provider catalog, routing map, Bridge protocol + server, OAuth managers and clients, the `~/.wisp` home store. vscode-free, private, never published — each face bundles it at build time. Tests live in [`packages/core/tests`](packages/core/tests). |
| [`packages/vscode`](packages/vscode) | The VS Code extension ([README](packages/vscode/README.md)): native chat provider, side panel (Preact + Tailwind), Inquire, Bridge host. |
| [`packages/tui`](packages/tui) | The Wisp TUI (opentui + React on Bun) + headless Bridge + `claude-wisp` launcher. Ships on npm as [`wisp-router`](https://www.npmjs.com/package/wisp-router). |

## Development

```sh
bun install        # root — one lockfile for all packages
bun run test       # 367 Vitest tests (packages/core/tests)
bun run compile    # typecheck + bundle + webview build (packages/vscode)
```

- **Extension:** press **F5** → Extension Development Host (the Wisp icon is in *that* window's activity bar). Package a `.vsix` with `bun run package` in `packages/vscode`.
- **TUI:** `cd packages/tui && bun run dev`. It writes the real `~/.wisp` — set `WISP_HOME` to sandbox.

## Releases

Tag `v<version>` (must equal the version in `packages/tui/package.json`) and push — the `Release` workflow compiles binaries for win32-x64 / darwin-arm64 / darwin-x64 / linux-x64 via `bun build --compile`, attaches them to a GitHub release, and publishes `wisp-router` (thin shell + platform packages, with a GitHub-release download fallback) to npm.
