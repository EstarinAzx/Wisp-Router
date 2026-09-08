# wisp-router

**Wisp** — a BYOK model router, in your terminal.

- `wisp` — the TUI: pick a Provider (OpenCode Go, Codex/ChatGPT, Anthropic/Claude.ai, OpenAI, Groq, Mistral, OpenRouter, Ollama, and more), set keys or OAuth sign-in, edit the Routing map, host the Bridge.
- `wisp serve` — the headless Bridge: a local OpenAI-compatible **and** Anthropic-compatible endpoint that routes to whichever backend you configured.
- `claude-wisp` — launch Claude Code pre-wired to the Bridge (env on the child only, argv passed through verbatim).
- `codex-wisp` (2.1.4) — launch installed native Codex through the Bridge's visible-history Responses subset. Codex owns tools and policy; saved configuration and authentication remain unchanged.

## Install

```
npm i -g wisp-router
```

Ships as a compiled per-platform binary (win32-x64, darwin-arm64, darwin-x64, linux-x64).
The binary needs neither Bun nor Node.js; npm command shims require Node.js >=16. All three
commands use the same exact-version optional dependency or release-download cache.

## Quick start

```
wisp            # the TUI — type / for commands (/providers, /key, /model, /routing, /bridge, …)
wisp serve      # headless Bridge host
claude-wisp     # Claude Code through the Bridge (start the Bridge first)
codex-wisp      # native Codex through a 2.1.4 Bridge (start the Bridge first)
```

Direct binary: `wisp codex-wisp exec "Explain this project"`. Native Codex must be installed
separately. On Windows, Wisp starts the native executable or npm JavaScript entry directly,
preserving literal arguments without a shell. Native model selection and `-m` pass through;
Wisp resolves Provider id, exact Alias, Family route, then Active Provider. Use an Alias to
pin a specific backend model.

Verified subset: `codex-cli 0.153.4`, visible text/image history, function/custom tools and
client discovery with namespaced follow-up. Hosted search, opaque reasoning/compaction replay,
structured output and provider/profile overrides are unsupported and rejected. Image support
depends on the Provider wire; custom grammar is described but not enforced by generic upstreams.
Full limits and source invocation: [Codex guide](https://github.com/EstarinAzx/Wisp-Router/blob/main/docs/codex-wisp.md).

2.1.4 preparation verifies local Windows artifacts against deterministic mock Providers.
macOS/Linux release smoke jobs and live-provider acceptance are not claimed as locally run.
Publication is separate; existing 2.1.3 installations do not include the new launcher.

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
