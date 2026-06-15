---
type: overview
project: wisp
updated: 2026-06-15
tags: [context, overview]
---

# Overview

**Project:** wisp
**One-liner:** **Wisp** — a VS Code extension that provides AI inline (ghost-text) completions routed through the OpenCode Zen `go` endpoint (an OpenAI-compatible API), with a Preact + Tailwind v4 side panel for managing the API key, model, and on/off toggle. **Wisp** is the product; **OpenCode Zen** is the (current, first) provider.

## Layout
- `src/` — extension-host (Node) TypeScript. `extension.ts` (provider, commands, shared actions) + `sidePanelProvider.ts` (the WebviewView).
- `webview/` — Preact + Tailwind v4 side-panel UI (own tsconfig), bundled separately by Vite.
- `media/` — activity-bar icon SVG.
- `.vscode/` — `launch.json` (F5 → Extension Development Host) + `tasks.json` (build).
- `out/` — `tsc` output for the extension (`out/extension.js`). Git-ignored.
- `dist/webview/` — Vite output for the webview (single unhashed `main.js` + `main.css`). Git-ignored.
- `PRD.md` — product requirements for the whole thing incl. the side panel.
- `CONTEXT.md` — domain glossary (ubiquitous language); owns term definitions like **Activity = Thinking | Idle**.
- `issues.md` — local issue tracker (repo is non-git), tracer-bullet slices.
- Side-panel implementation plan (now executed) lives outside the repo at the agent plan path noted in [[active-work]].

## How to run
- Install: `npm install`
- Build: `npm run compile` (`tsc -p ./ && tsc -p webview && vite build`).
- Dev: press **F5** in VS Code → Extension Development Host (the Wisp icon is in *that* window's activity bar).
- Package: `npx @vscode/vsce package --allow-missing-repository --skip-license` → installable `.vsix`.
- Set key: the **Wisp side panel** (activity-bar icon), command **Wisp: Set API Key**, or env `OPENCODE_API_KEY`.

## Where to look first
- Entry point: `src/extension.ts` — provider registration, completion logic, commands, status bar, shared actions.
- Side panel: `src/sidePanelProvider.ts` + `webview/app.tsx`.
- Product intent: `PRD.md`.
- What's next (tests, model tuning): [[active-work]].

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
