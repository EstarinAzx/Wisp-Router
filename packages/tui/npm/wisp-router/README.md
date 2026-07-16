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

## Routing

```sh
wisp routing                                  # show Family routes and Aliases
wisp routing --json                           # machine-readable snapshot
wisp routing set haiku codex/gpt-5.3-codex   # set a Family route
wisp routing set fast openrouter/openai/gpt-5 # create or retarget an Alias
wisp routing unset haiku                      # clear a Family route
wisp routing unset fast                       # remove an Alias
```

Targets use `<providerId>/<model>` and split on the first `/`, so Provider-native model ids may contain more slashes. A valid target is written even when its Provider lacks an API key or OAuth sign-in; the command exits zero and prints a `warning:` line.

Routing commands edit the shared `~/.wisp/config.json` atomically. A running Bridge reads that file for every request, so the next request uses the new binding without a restart.

State lives in `~/.wisp/` (`config.json` + owner-only `auth.json`), shared with the Wisp VS Code extension.

## Versioning

`wisp-router` starts at **2.0.x** — there is no 1.x npm line. It shares the monorepo with the 1.x Wisp VS Code extension; the two faces version independently.

Source and docs: [github.com/EstarinAzx/Wisp-Router](https://github.com/EstarinAzx/Wisp-Router).
