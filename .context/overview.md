---
type: overview
project: wisp
updated: 2026-07-14
tags: [context, overview]
---

# Overview

**Project:** wisp
**One-liner:** **Wisp** — a VS Code extension framed as a **BYOK model router for VS Code's Copilot chat harness** (v1.6.0): it registers a **Provider catalog** of backends as selectable models in VS Code's **native chat / Agent mode / Ctrl+I picker** (the LM Chat Provider API, vendor `wisp`, finalized in 1.104) with streaming, **tool calling**, vision (Anthropic vision wired in v1.4.1), and live models.dev caps. The two OAuth differentiators — **ChatGPT subscription** (Codex) and **Claude.ai subscription** (Anthropic) — are what native BYOK can't reach. The **secondary** surface is **Inquire** (type an instruction → the model returns SEARCH/REPLACE edit blocks over whole-file context, applied and reviewed as an in-editor accept/reject diff), routing through the **Active Provider**. Catalog: **12 built-ins** (OpenCode Go default · OpenCode Zen · **Codex** · **Anthropic** · OpenAI · Groq · Mistral · OpenRouter · Ollama · Ollama Cloud · KiloCode · Cline) **+ Custom**, with a Preact + Tailwind v4 side panel. Three Provider **kinds**: API-key (OpenAI-compatible), **Codex** (`kind:'codex'`, ChatGPT OAuth, Responses API), and **Anthropic** (`kind:'anthropic-oauth'`, Claude.ai OAuth, Messages API). _Ghost-text Completion was removed in slice #5 (2026-06-17); there is no autocomplete-as-you-type._

## Layout

Bun-workspaces **monorepo** since #58 / PR #70 (ADR-0001): three packages, one root `bun.lock`.

- `packages/core/src/` — the **engine**, vscode-free, private (`@wisp/core`, never published; `main`/`types` point at raw TS — each face bundles it, core has no build step). `catalog.ts` (pure Provider-catalog data + resolvers + Inquire/Codex/Anthropic helpers; unit-tested by `catalog.test.ts` + `codex.test.ts` + `anthropic.test.ts`) + `codexClient.ts`/`anthropicClient.ts` (Responses/Messages fetch + SSE→text). `bridge.ts` (slice #36) is the pure **Bridge** protocol translator — inbound OpenAI `/v1/chat/completions` → Wisp turns, outbound Wisp stream → OpenAI SSE, and `GET /v1/models` (unit-tested by `bridge.test.ts`); `bridgeServer.ts` is the shipped HTTP listener (#37–#40 all landed). The **Anthropic door** (PRD #43, v1.5.0) is a second Bridge dialect (`/v1/messages` + Anthropic-flavored `/v1/models`) so **Claude Code** routes through Wisp; `routing.ts` (v1.6.0, PRD #50) is the pure **Routing map** — family routes + aliases pinning bridged model names to chosen Targets. `index.ts` is the barrel — everything re-exported flat as `@wisp/core`.
- `packages/vscode/src/` — the extension host. `extension.ts` (the Inquire command, commands, shared actions, status bar) + `sidePanelProvider.ts` (the WebviewView) + `chatProvider.ts` (the native LM chat-provider glue) + the OAuth **managers** `codexAuth.ts`/`anthropicAuth.ts` (they import `vscode.SecretStorage`, so they live here until #59 moves secrets to auth.json).
- `packages/vscode/webview/` — Preact + Tailwind v4 side-panel UI (own tsconfig), bundled separately by Vite.
- `packages/vscode/media/` — activity-bar icon SVG. Manifest/README/CHANGELOG also live in `packages/vscode/` (vsce reads them from the package dir).
- `packages/tui/` — empty scaffold (`@wisp/tui`); the real TUI + `wisp-router` naming land in #60.
- `.vscode/` — `launch.json` (F5 → Extension Development Host, dev path `packages/vscode`) + `tasks.json` (build task = `bun run compile` in `packages/vscode`).
- `packages/vscode/dist/` — esbuild bundle `extension.js` (core + openai inlined) + `webview/` Vite output (single unhashed `main.js` + `main.css`). Git-ignored. The old root `out/` is gone.
- `PRD.md` — product requirements for the whole thing incl. the side panel.
- `CONTEXT.md` — domain glossary (ubiquitous language); owns term definitions like **Activity = Thinking | Idle**.
- `issues.md` — original local issue tracker, tracer-bullet slices. The repo is now git with remote `EstarinAzx/Wisp-Router` (renamed from `Wisp`; old URLs redirect); **current** work is tracked as GitHub issues. See [[active-work]].
- Side-panel implementation plan (now executed) lives outside the repo at the agent plan path noted in [[active-work]].

## How to run
- Install: `bun install` (root — one lockfile for all three packages).
- Build: `bun run compile` (root, or in `packages/vscode`) = `tsc -p ./ && tsc -p webview` (typecheck-only) `&& esbuild bundle && vite build`.
- Test: `bun run test` (root → 304 Vitest tests in `packages/core/src/*.test.ts`; no Electron host).
- Dev: press **F5** in VS Code → Extension Development Host (the Wisp icon is in *that* window's activity bar).
- Package: `bun run package` in `packages/vscode` (= `vsce package --no-dependencies`; deps are already bundled) → installable `.vsix`.
- Set key: the **Wisp side panel** (activity-bar icon), command **Wisp: Set API Key**, or env `OPENCODE_API_KEY`.

## Where to look first
- Entry point: `packages/vscode/src/extension.ts` — the Inquire command + commands, status bar, shared actions.
- Side panel: `packages/vscode/src/sidePanelProvider.ts` + `packages/vscode/webview/app.tsx`.
- Engine: `packages/core/src/` via the `index.ts` barrel (`@wisp/core`).
- Product intent: `PRD.md`.
- What's next (tests, model tuning): [[active-work]].

## Conventions
- Arrow functions by default (project `CLAUDE.md` rule); regular `function` only where `this`/hoisting/generators require it.
- Source files follow an "elucidate" house style: a title banner, a file-top `Depends on / Data shapes` block, section banners, and sparse why-comments. Match it when editing any `packages/*/src` file.
- API key is **never** stored in plaintext settings — SecretStorage + `OPENCODE_API_KEY` env fallback only.

## Map

- [[stack]] — languages, libraries, env vars
- [[api]] — the extension's command/provider/settings surface + the external Zen API
- [[active-work]] — current handoff state
- [[flows]] — recorded end-to-end code flows
- [[happy-path]] — the Bridge golden-path MVD (design-time user journey)
- [[decisions]] — settled questions (design review + side-panel forks)
- [[gotchas]] — non-obvious traps (chat-as-completer, CSP, two tsconfigs)
