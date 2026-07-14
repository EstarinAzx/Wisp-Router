# wisp-router

**Wisp** — a BYOK model router, in your terminal.

- `wisp` — the TUI: pick a Provider (OpenCode Go, Codex/ChatGPT, Anthropic/Claude.ai, OpenAI, Groq, Mistral, OpenRouter, Ollama, and more), set keys or OAuth sign-in, edit the Routing map, host the Bridge.
- `wisp serve` — the headless Bridge: a local OpenAI-compatible **and** Anthropic-compatible endpoint that routes to whichever backend you configured.
- `claude-wisp` — launch Claude Code pre-wired to the Bridge (env on the child only, argv passed through verbatim).

## Install

```
npm i -g wisp-router
```

Ships as a compiled per-platform binary (win32-x64, darwin-arm64, darwin-x64, linux-x64) — no Bun or particular Node version needed at runtime.

## Quick start

```
wisp            # the TUI — type / for commands (/providers, /key, /model, /routing, /bridge, …)
wisp serve      # headless Bridge host
claude-wisp     # Claude Code through the Bridge (start the Bridge first)
```

State lives in `~/.wisp/` (`config.json` + owner-only `auth.json`), shared with the Wisp VS Code extension.

Source and docs: [github.com/EstarinAzx/Wisp-Router](https://github.com/EstarinAzx/Wisp-Router).
