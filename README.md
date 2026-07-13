# Wisp

**Run your ChatGPT or Claude.ai subscription as a model inside VS Code's GitHub Copilot chat.** Sign in with your ChatGPT or Claude.ai account and Codex or Claude models answer right in the native **Chat view**, **Agent mode**, and the **`Ctrl+I`** picker — on your own subscription, no API key.

This is the one thing VS Code's built-in "add a custom model" option **can't** do: it authenticates with a static API key, so it can reach an OpenAI-compatible endpoint but never an **OAuth subscription login**. Wisp can — that's its reason to exist next to Copilot.

Wisp is a **BYOK model router** for the Copilot harness, registering your own backends as selectable models through the finalized `languageModelChatProviders` extension API (vendor `wisp`, stable in VS Code 1.104 — **not** a proposed API, so it works in stock VS Code and is publishable). Three kinds of backend:

- **Your ChatGPT (Codex) subscription, via OAuth** — No key; runs Codex on your own ChatGPT plan through the Responses API. Native custom-endpoint BYOK can't reach this.
- **Your Claude.ai subscription, via OAuth** — No key; runs Claude on your own Max/Pro/Team plan through the Messages API. Same limitation: native BYOK won't reach it.
- **Any OpenAI-compatible API key** — OpenAI, Groq, Mistral, OpenRouter, OpenCode, a local Ollama box, or any Custom base URL.

Net: run Copilot's chat / agent / edit experience on the model access you already pay for — your ChatGPT or Claude.ai subscription, or any key-based backend.

- **Version:** 1.5.0
- **Requires:** VS Code 1.104+
- **Repo:** [github.com/EstarinAzx/Wisp](https://github.com/EstarinAzx/Wisp)
- **Not on the Marketplace** — install from a `.vsix` release or from source (see [Install](#install)).

---

## Quickstart

1. **Install the extension.** Download the latest `.vsix` from the [GitHub Releases](https://github.com/EstarinAzx/Wisp/releases) page, then in VS Code open **Extensions → ⋯ → Install from VSIX…** and select the file. (Full options, including building from source, are in [Install](#install).)
2. **Pick a provider.** Open the **Wisp side panel** from the activity-bar icon and choose your **Active Provider**, or run **`Wisp: Set API Key`** from the Command Palette to store a key for it.
   - The default provider is **OpenCode Go**.
   - For a key-based provider, paste your key — it goes straight to the OS keychain (see [Security](#security)).
   - To use your **ChatGPT subscription**, run **`Wisp: Sign in to Codex`** instead of setting a key.
   - To use your **Claude.ai subscription**, run **`Wisp: Sign in to Claude`** instead of setting a key.
   - For a local, keyless model, pick **Ollama**.
3. **Pick a model.** Run **`Wisp: List / Choose Model`** to fetch the provider's available models and select one. Each provider remembers its own model.
4. **Use it.** Open the VS Code **Chat view** (or press **`Ctrl+I`** for inline chat) and open the model dropdown. Your Wisp-routed model(s) appear as selectable rows — complete with their real context window and capabilities — right next to Copilot's own models. Select one and start chatting, editing, or running Agent mode.

---

## Why route your own models?

You already have model access you're paying for — a ChatGPT subscription, a Groq or OpenAI key, an Ollama box on your LAN. VS Code's chat/agent/edit UI is excellent, and its built-in BYOK can already add an API-key endpoint — but it stops at a *static key*, so your **ChatGPT subscription** can't get in. Wisp makes all of your backends *first-class citizens* of that UI, subscription included:

- **Your ChatGPT (Codex) subscription, in Chat, Agent, and Edit.** Sign in with your ChatGPT account and run OpenAI's Codex models through the Responses API — streaming, tool calling, vision, no API key. This is the part native BYOK can't do.
- **Your Claude.ai subscription, in Chat, Agent, and Edit.** Sign in with your Claude.ai account and run Claude (Opus, Sonnet, Haiku) through the Messages API — streaming, tool calling, vision, reasoning Effort, no API key. Same part native BYOK won't reach.
- **Agent mode on your own Groq or OpenAI key.** Switch to Agent mode, pick a Wisp-routed model, and let it call tools and edit files — billed to your key, not a Copilot seat.
- **A local Ollama model in chat.** Point Wisp at Ollama on `localhost` (no key), pick it in the chat picker, and keep your prompts and code entirely on-device.
- **Mix and match.** Every usable provider shows up as its own model row alongside Copilot's. Choose per-conversation which one answers.

One IDE harness, many model backends — instead of juggling separate extensions, each with its own UI, keybindings, and quirks.

---

## What works in the harness

Wisp-routed models are **first-class** in the Copilot harness, not a degraded fallback:

- **Streaming responses** — tokens stream into the chat as they arrive.
- **Tool calling** — agent tools are forwarded and tool calls round-trip, so Wisp models work in **Agent mode**, **Edit mode**, and **`Ctrl+I`**. This matters: VS Code **hides** models that lack tool-calling from those pickers, so tool calling is exactly what makes a routed model selectable there. Wisp models are first-class.
- **Vision** — image attachments are forwarded to multimodal models.
- **Live, per-model context windows + capabilities** — read from [models.dev](https://models.dev) (cached, with graceful fallback). The picker shows each model's real numbers and tracks model switches as you make them.

---

## Providers

Wisp ships a curated catalog of **12 built-in providers** plus a **Custom** escape hatch. Exactly one provider is the **Active Provider** at a time — it drives [Inquire](#inquire--ai-inline-code-edit) and the default routing — but the chat harness lists **every usable provider** as its own model row. Each provider remembers its own key and its own model.

There are three provider **kinds**.

### API-key providers

OpenAI-compatible chat endpoints authenticated with a Bearer key.

| Provider | Key required | Notes |
| --- | --- | --- |
| **OpenCode Go** | Yes | **Default provider.** |
| OpenCode Zen | Yes | |
| OpenAI | Yes | |
| Groq | Yes | |
| Mistral | Yes | |
| OpenRouter | Yes | |
| Ollama | No | Local; no key needed. |
| Ollama Cloud | Yes | |
| KiloCode | Yes | |
| Cline | Yes | User-supplied key only (their ToS). |

### Codex provider

| Provider | Auth | Notes |
| --- | --- | --- |
| **Codex** | ChatGPT account (OAuth) | No API key. Runs OpenAI's Codex models on **your own ChatGPT subscription** via the Responses API. Usable whenever you're signed in. Supports streaming, tool calling, and vision in the harness, just like the others. |

Reach Codex by running **`Wisp: Sign in to Codex`** (OAuth with a ChatGPT account). You can also import an existing Codex CLI login — see [Security](#security).

### Anthropic provider

| Provider | Auth | Notes |
| --- | --- | --- |
| **Anthropic** | Claude.ai account (OAuth) | No API key. Runs Claude on **your own Claude.ai subscription** (Max/Pro/Team) via the Messages API. Supports streaming, tool calling, vision, and the full **Effort** ladder (`low` → `max`). |

Reach Claude by running **`Wisp: Sign in to Claude`** (OAuth with a Claude.ai account).

### Custom

| Provider | Auth | Notes |
| --- | --- | --- |
| **Custom** | Bearer key | Any OpenAI-compatible base URL you supply via [`wisp.baseUrl`](#settings). |

> **Not providers:** GitHub Copilot and Cursor are deliberately excluded (incompatible / against their ToS).

---

## Inquire — AI inline code edit

Inquire is Wisp's inline editing command. It is **independent of the chat harness** and routes through your **Active Provider** (including Codex).

1. Select code — or just place the caret; it uses the current line.
2. Press **`Ctrl+Shift+I`** (**`Cmd+Shift+I`** on macOS), or right-click → **Wisp: Inquire**, or run it from the Command Palette.
3. Type a natural-language instruction.

The model returns **SEARCH/REPLACE** edit blocks; Wisp applies them and shows an **in-editor accept/reject diff**. The whole file is sent as context.

Inquire is **code-only** and **fails safe**: a block whose search text isn't found in the file is skipped, never force-applied — so it can't corrupt your file.

---

## Bridge (experimental)

> **Experimental.** The Bridge is new and may change. It opens a local network listener — treat it as a power-user feature.

The Bridge is the **reverse** of the chat harness: instead of routing your backends *into* VS Code, it exposes them *out* as a local endpoint on `127.0.0.1` speaking **two dialects** — OpenAI-compatible and Anthropic Messages — so external tools like the **GitHub Copilot CLI** and **Claude Code** can run on the same providers, including your **ChatGPT (Codex)** and **Claude.ai** subscriptions.

- **Turn it on** from the **Wisp side panel** (Bridge **Start / Stop**) or the **`Wisp: Toggle Bridge`** command. While running, the panel shows the **address** (`http://127.0.0.1:41184` by default) and a generated **access secret**, both with copy buttons.
- **Auth.** Every request needs the access secret — `Authorization: Bearer <secret>` or `x-api-key: <secret>`. The secret is generated on start, lives in the OS keychain, and is shown only while the Bridge is running.
- **Endpoints.** `GET /v1/models`, `POST /v1/chat/completions` (OpenAI dialect, streaming or not), and `POST /v1/messages` (Anthropic dialect, SSE). A request naming a provider id routes to it; anything else falls back to your **Active Provider**.
- **Copilot CLI, zero setup.** Terminals opened *after* you start the Bridge inherit `COPILOT_*` environment variables that point the Copilot CLI straight at the Bridge — open a new terminal, run `copilot`, and it's already on your Wisp providers.
- **Claude Code, copy-paste setup.** The panel's **Claude Code** section (Bridge running) offers ready-to-copy env snippets — PowerShell / bash session lines or a project `.claude/settings.json` block — carrying the live address, secret, and model-discovery flag. Paste, open a fresh terminal, run `claude`: every Wisp provider shows up in Claude Code's own `/model` picker (as `claude-wisp-*` rows) with streaming and full tool round-trips, and Claude Code's `/effort` level is forwarded to the backend.
- **Local only.** The listener binds `127.0.0.1` (never a public interface). Change the port with [`wisp.bridge.port`](#settings).

---

## Side panel & status bar

- **Side panel** (activity-bar icon): manage the **Active Provider**, its **API key**, **model**, and **Effort** (reasoning depth); **sign in / out of Codex or Claude**; and watch a **Thinking / Idle** activity indicator.
- **Status-bar item**: shows **ready / thinking / error** state.

---

## Commands

Available from the Command Palette (and the editor chrome where noted):

| Command | Shortcut | What it does |
| --- | --- | --- |
| **Wisp: Set API Key** | — | Store the Active Provider's key in the OS keychain. |
| **Wisp: List / Choose Model** | — | Fetch the provider's `/models` and pick one. |
| **Wisp: Inquire** | `Ctrl+Shift+I` / `Cmd+Shift+I` | The inline code edit (also via right-click). |
| **Wisp: Sign in to Codex** | — | OAuth sign-in with a ChatGPT account. |
| **Wisp: Sign out of Codex** | — | Sign out of Codex. |
| **Wisp: Sign in to Claude** | — | OAuth sign-in with a Claude.ai account. |
| **Wisp: Sign out of Claude** | — | Sign out of Claude. |
| **Wisp: Toggle Bridge** | — | Start/stop the local Bridge endpoint (experimental). |

---

## Settings

All settings live under `wisp.*`.

| Setting | Default | Scope | Description |
| --- | --- | --- | --- |
| `wisp.provider` | `opencode-go` | Machine | The Active Provider id. |
| `wisp.baseUrl` | `https://opencode.ai/zen/go/v1` | Machine | Base URL — **used only when `wisp.provider` is `custom`** (built-in providers use their own hardcoded URLs). |
| `wisp.model` | `minimax-m3` | — | Bare model id (the endpoints reject provider-prefixed ids). |
| `wisp.maxTokens` | `0` | — | Max output tokens; `0` = uncapped. |
| `wisp.temperature` | `0.1` | — | Sampling temperature. |
| `wisp.bridge.port` | `41184` | Machine | Port the Bridge listener binds on `127.0.0.1` (experimental). |

---

## Security

- **Keys live in the OS keychain** (VS Code SecretStorage) — never in plaintext settings. Per-provider environment-variable fallbacks exist (e.g. `OPENCODE_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_API_KEY`).
- **Keys are write-only to the UI** — the stored key value is never exposed back to the webview.
- **No workspace key redirection.** Built-in provider base URLs are hardcoded in the extension and the provider selector is **machine-scoped**, so a malicious workspace can't redirect your Bearer key to an attacker's endpoint. Only the **Custom** provider's URL is user-supplied (also machine-scoped).
- **Codex tokens** are stored in SecretStorage. You can import an existing Codex CLI login (`~/.codex/auth.json`).

---

## Install

Wisp is **not on the VS Code Marketplace**.

### From a release

1. Download the `.vsix` from the [GitHub Releases](https://github.com/EstarinAzx/Wisp/releases) page.
2. In VS Code: **Extensions → ⋯ → Install from VSIX…** and select the file.

### From source

```bash
npm install
npm run compile
```

Then press **F5** to launch the Extension Development Host. To package a `.vsix`:

```bash
npx @vscode/vsce package
```
