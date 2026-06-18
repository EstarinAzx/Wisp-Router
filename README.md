# Wisp

**A model router for VS Code's GitHub Copilot chat harness.** Bring your own key — or your own ChatGPT account — and run Copilot's Chat, Agent, and inline-edit UI with non-Copilot models.

Wisp registers **your own** model backends as selectable models inside VS Code's native **Chat view**, **Agent mode**, and the **`Ctrl+I` inline-chat picker** — the same harness GitHub Copilot Chat drives. It does this through the finalized `languageModelChatProviders` extension API (vendor `wisp`, finalized in VS Code 1.104 — a stable API, **not** a proposed one, so the extension is publishable and works in stock VS Code).

Net effect: you can run Copilot's chat / agent / edit experience with models from your own API keys, or even your ChatGPT subscription via Codex — instead of (or alongside) Copilot's built-in models.

- **Version:** 1.1.0
- **Requires:** VS Code 1.104+
- **Repo:** [github.com/EstarinAzx/BYOK-IDE-Auto-Complete](https://github.com/EstarinAzx/BYOK-IDE-Auto-Complete)
- **Not on the Marketplace** — install from a `.vsix` release or from source (see [Install](#install)).

---

## Quickstart

1. **Install the extension.** Download the latest `.vsix` from the [GitHub Releases](https://github.com/EstarinAzx/BYOK-IDE-Auto-Complete/releases) page, then in VS Code open **Extensions → ⋯ → Install from VSIX…** and select the file. (Full options, including building from source, are in [Install](#install).)
2. **Pick a provider.** Open the **Wisp side panel** from the activity-bar icon and choose your **Active Provider**, or run **`Wisp: Set API Key`** from the Command Palette to store a key for it.
   - The default provider is **OpenCode Go**.
   - For a key-based provider, paste your key — it goes straight to the OS keychain (see [Security](#security)).
   - To use your **ChatGPT subscription**, run **`Wisp: Sign in to Codex`** instead of setting a key.
   - For a local, keyless model, pick **Ollama**.
3. **Pick a model.** Run **`Wisp: List / Choose Model`** to fetch the provider's available models and select one. Each provider remembers its own model.
4. **Use it.** Open the VS Code **Chat view** (or press **`Ctrl+I`** for inline chat) and open the model dropdown. Your Wisp-routed model(s) appear as selectable rows — complete with their real context window and capabilities — right next to Copilot's own models. Select one and start chatting, editing, or running Agent mode.

---

## Why route your own models?

You already have model access you're paying for — a Groq key, an OpenAI key, a ChatGPT subscription, an Ollama box on your LAN. VS Code's chat/agent/edit UI is excellent, but it's wired to Copilot's catalog. Wisp closes that gap by making your backends *first-class citizens* of that same UI:

- **Agent mode on your own Groq or OpenAI key.** Switch to Agent mode, pick a Wisp-routed model, and let it call tools and edit files — billed to your key, not a Copilot seat.
- **Edit mode driven by your ChatGPT (Codex) subscription.** Sign in with your ChatGPT account and run OpenAI's Codex models through the Responses API. No API key required.
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

Wisp ships a curated catalog of **11 built-in providers** plus a **Custom** escape hatch. Exactly one provider is the **Active Provider** at a time — it drives [Inquire](#inquire--ai-inline-code-edit) and the default routing — but the chat harness lists **every usable provider** as its own model row. Each provider remembers its own key and its own model.

There are two provider **kinds**.

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

## Side panel & status bar

- **Side panel** (activity-bar icon): manage the **Active Provider**, its **API key**, and its **model**; **sign in / out of Codex**; and watch a **Thinking / Idle** activity indicator.
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

1. Download the `.vsix` from the [GitHub Releases](https://github.com/EstarinAzx/BYOK-IDE-Auto-Complete/releases) page.
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
