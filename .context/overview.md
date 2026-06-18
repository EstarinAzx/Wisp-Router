---
type: overview
project: wisp
updated: 2026-06-19
tags: [context, overview]
---

# Overview

**Project:** wisp
**One-liner:** **Wisp** — a VS Code extension that is, as of v1.1.0, framed primarily as a **BYOK model router for VS Code's Copilot chat harness**: it registers a **Provider catalog** of backends as selectable models in VS Code's **native chat / Agent mode / Ctrl+I picker** (the LM Chat Provider API, vendor `wisp`, finalized in 1.104) with streaming, **tool calling**, vision, and live models.dev caps — so the user drives Copilot's chat/agent/edit UI with their own keys or ChatGPT subscription. The **secondary** surface is **Inquire** (type an instruction → the model returns SEARCH/REPLACE edit blocks over whole-file context, applied and reviewed as an in-editor accept/reject diff), which routes through the **Active Provider**. Catalog: **11 built-ins** (OpenCode Go default · OpenCode Zen · **Codex** · OpenAI · Groq · Mistral · OpenRouter · Ollama · Ollama Cloud · KiloCode · Cline) **+ Custom**, with a Preact + Tailwind v4 side panel for switching the Active Provider and managing its credential + model. Two Provider **kinds**: API-key (OpenAI-compatible chat) and **Codex** (`kind:'codex'`, ChatGPT-account OAuth sign-in, runs Codex models on the user's subscription via the Responses API). _Ghost-text Completion was removed in slice #5 (2026-06-17); there is no autocomplete-as-you-type._

## Layout
- `src/` — extension-host (Node) TypeScript. `extension.ts` (the Inquire command, commands, shared actions, status bar) + `sidePanelProvider.ts` (the WebviewView) + `chatProvider.ts` (the native LM chat-provider glue) + `catalog.ts` (vscode-free pure Provider-catalog data + resolvers + Inquire/Codex helpers; unit-tested by `catalog.test.ts` + `codex.test.ts`). Codex impurities are isolated: `codexAuth.ts` (OAuth/PKCE/loopback/SecretStorage/refresh) + `codexClient.ts` (Responses fetch + SSE→text).
- `webview/` — Preact + Tailwind v4 side-panel UI (own tsconfig), bundled separately by Vite.
- `media/` — activity-bar icon SVG.
- `.vscode/` — `launch.json` (F5 → Extension Development Host) + `tasks.json` (build).
- `out/` — `tsc` output for the extension (`out/extension.js`). Git-ignored.
- `dist/webview/` — Vite output for the webview (single unhashed `main.js` + `main.css`). Git-ignored.
- `PRD.md` — product requirements for the whole thing incl. the side panel.
- `CONTEXT.md` — domain glossary (ubiquitous language); owns term definitions like **Activity = Thinking | Idle**.
- `issues.md` — original local issue tracker, tracer-bullet slices. The repo is now git with remote `EstarinAzx/Wisp`; **current** work is tracked as GitHub issues (PRD #3, slices #4–#7). See [[active-work]].
- Side-panel implementation plan (now executed) lives outside the repo at the agent plan path noted in [[active-work]].

## How to run
- Install: `npm install`
- Build: `npm run compile` (`tsc -p ./ && tsc -p webview && vite build`).
- Test: `npm test` (Vitest — pure-logic unit tests in `src/*.test.ts`; no Electron host).
- Dev: press **F5** in VS Code → Extension Development Host (the Wisp icon is in *that* window's activity bar).
- Package: `npx @vscode/vsce package --allow-missing-repository --skip-license` → installable `.vsix`.
- Set key: the **Wisp side panel** (activity-bar icon), command **Wisp: Set API Key**, or env `OPENCODE_API_KEY`.

## Where to look first
- Entry point: `src/extension.ts` — the Inquire command + commands, status bar, shared actions.
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
