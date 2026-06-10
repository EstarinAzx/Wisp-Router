---
type: overview
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, overview]
---

# Overview

**Project:** opencode-autocomplete
**One-liner:** A VS Code extension that provides AI inline (ghost-text) completions routed through the OpenCode Zen `go` endpoint (an OpenAI-compatible API), with a planned Preact + Tailwind v4 side panel for managing the API key, model, and on/off toggle.

## Layout
- `src/` — extension-host (Node) TypeScript. Currently one file, `extension.ts`, holding the whole extension.
- `webview/` — **(planned)** Preact + Tailwind v4 side-panel UI, bundled separately by Vite.
- `media/` — **(planned)** activity-bar icon SVG.
- `out/` — `tsc` output for the extension (`out/extension.js`). Git-ignored.
- `dist/webview/` — **(planned)** Vite output for the webview (single `main.js` + `main.css`). Git-ignored.
- `PRD.md` — product requirements for the whole thing incl. the side panel.
- Approved side-panel implementation plan lives outside the repo at the agent plan path noted in [[active-work]].

## How to run
- Install: `npm install`
- Build: `npm run compile` (currently `tsc -p ./`; will become `tsc && vite build`)
- Dev: press **F5** in VS Code → Extension Development Host.
- Set key: command **OpenCode: Set API Key**, or env `OPENCODE_API_KEY`.

## Where to look first
- Entry point: `src/extension.ts` — provider registration, completion logic, commands, status bar.
- Product intent: `PRD.md`.
- The side-panel work that's queued next: [[active-work]].

## Conventions
- Arrow functions by default (project `CLAUDE.md` rule); regular `function` only where `this`/hoisting/generators require it.
- Source files follow an "elucidate" house style: a title banner, a file-top `Depends on / Data shapes` block, section banners, and sparse why-comments. Match it when editing `src/extension.ts`.
- API key is **never** stored in plaintext settings — SecretStorage + `OPENCODE_API_KEY` env fallback only.

## Map

- [[stack]] — languages, libraries, env vars
- [[api]] — the extension's command/provider/settings surface + the external Zen API
- [[active-work]] — current handoff state
- [[decisions]] — settled questions (design review + side-panel forks)
- [[gotchas]] — non-obvious traps (chat-as-completer, CSP, two tsconfigs)
