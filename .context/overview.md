---
type: overview
project: wisp
updated: 2026-07-15
tags: [context, overview]
---

# Overview

**Project:** wisp
**One-liner:** **Wisp** — a VS Code extension framed as a **BYOK model router for VS Code's Copilot chat harness** (v1.6.0): it registers a **Provider catalog** of backends as selectable models in VS Code's **native chat / Agent mode / Ctrl+I picker** (the LM Chat Provider API, vendor `wisp`, finalized in 1.104) with streaming, **tool calling**, vision (Anthropic vision wired in v1.4.1), and live models.dev caps. The two OAuth differentiators — **ChatGPT subscription** (Codex) and **Claude.ai subscription** (Anthropic) — are what native BYOK can't reach. The **secondary** surface is **Inquire** (type an instruction → the model returns SEARCH/REPLACE edit blocks over whole-file context, applied and reviewed as an in-editor accept/reject diff), routing through the **Active Provider**. Catalog: **13 built-ins** (OpenCode Go default · OpenCode Zen · **Codex** · **Anthropic** · **Grok** · OpenAI · Groq · Mistral · OpenRouter · Ollama · Ollama Cloud · KiloCode · Cline) **+ Custom**, with a Preact + Tailwind v4 side panel. Four Provider **kinds**: API-key (OpenAI-compatible), **Codex** (`kind:'codex'`, ChatGPT OAuth, Responses API), **Anthropic** (`kind:'anthropic-oauth'`, Claude.ai OAuth, Messages API), and **Grok** (`kind:'xai-oauth'`, xAI OAuth, Responses API — a Codex-twin; `id:'xai'`, ≠ the API-key **Groq** row). _(#91, shipped 2026-07-15; `wisp-router@2.0.5` released to npm 2026-07-15.)_ _Ghost-text Completion was removed in slice #5 (2026-06-17); there is no autocomplete-as-you-type._

## Layout

Bun-workspaces **monorepo** since #58 / PR #70 (ADR-0001): three packages, one root `bun.lock`.

- `packages/core/src/` — the **engine**, vscode-free, private (`@wisp/core`, never published; `main`/`types` point at raw TS — each face bundles it, core has no build step). `catalog.ts` (pure Provider-catalog data — since #60 including the **`PROVIDERS` array itself**, shared by both faces — + resolvers + Inquire/Codex/Anthropic helpers; unit-tested by `catalog.test.ts` + `codex.test.ts` + `anthropic.test.ts`) + `codexClient.ts`/`anthropicClient.ts` (Responses/Messages fetch + SSE→text). `bridge.ts` (slice #36) is the pure **Bridge** protocol translator — inbound OpenAI `/v1/chat/completions` → Wisp turns, outbound Wisp stream → OpenAI SSE, and `GET /v1/models` (unit-tested by `bridge.test.ts`); `bridgeServer.ts` is the shipped HTTP listener (#37–#40 all landed). The **Anthropic door** (PRD #43, v1.5.0) is a second Bridge dialect (`/v1/messages` + Anthropic-flavored `/v1/models`) so **Claude Code** routes through Wisp; `routing.ts` (v1.6.0, PRD #50) is the pure **Routing map** — family routes + aliases pinning bridged model names to chosen Targets, plus the pure edit ops `withFamilyRoute`/`withAlias`/`withAliasRenamed`/`withoutAlias` (#65, rename added 2026-07-15) both faces persist through. `home.ts`/`homeStore.ts` (#59, ADR-0002) are the **Wisp home store** — pure config/auth schema + migration mapping, and the `~/.wisp/` fs layer (atomic writes, owner-only auth.json, dir watcher), shared with the TUI. `slash.ts` (#60) is the TUI palette's pure layer — `parseSlash`/`suggestSlash` + `SLASH_COMMANDS` (`slash.test.ts`). Since #61 core also owns the OAuth **managers** `codexAuth.ts`/`anthropicAuth.ts` (browser sign-in flows + token lifecycle; editor-free — injected `openExternal` + injected auth.json store slices, loopback redirect catchers on node http). `index.ts` is the barrel — everything re-exported flat as `@wisp/core`.
- `packages/vscode/src/` — the extension host. `extension.ts` (the Inquire command, commands, shared actions, status bar, the WispHome wiring + one-time store migration) + `sidePanelProvider.ts` (the WebviewView) + `chatProvider.ts` (the native LM chat-provider glue). The OAuth managers moved to core in #61 — the extension instantiates `CodexAuth`/`AnthropicAuth` from `@wisp/core` with `vscode.env.openExternal` injected.
- `packages/vscode/webview/` — Preact + Tailwind v4 side-panel UI (own tsconfig), bundled separately by Vite.
- `packages/vscode/media/` — activity-bar icon SVG. Manifest/README/CHANGELOG also live in `packages/vscode/` (vsce reads them from the package dir).
- `packages/tui/` — the **TUI face** (#60): **published on npm as `wisp-router` (2.0.1, #67)**, bins `wisp` + `claude-wisp` (#64). Delivery = `bun build --compile` per-platform binaries: `packages/tui/npm/wisp-router` is the thin JS shell (optionalDependencies on `@tsd47216/wisp-router-<target>`, GitHub-release download fallback), built + published by `.github/workflows/release.yml` on tag `v*` (tag must equal `packages/tui/package.json` version). The compiled entry dispatches on argv: `serve` / `claude-wisp` / else TUI. opentui 0.4.3 (`@opentui/core` + `@opentui/react`) + React 19 on Bun; no build step — `bun run dev` runs `src/index.tsx` + `src/app.tsx` (splash `Wisp_` + version, slash palette, `/providers` `/key` `/model` `/routing` `/aliasonly` `/signin` `/signout` `/effort` `/test` `/bridge` `/quit`; the OAuth commands drive core's `CodexAuth`/`AnthropicAuth`, and `/test` (#62) streams one canned prompt via the exported `streamTestReply`). Since #63 the TUI also **hosts the Bridge**: `src/store.ts` (shared `~/.wisp` handle + OAuth managers), `src/bridge.ts` (BridgeDeps wiring — twin of the extension's), `src/serve.ts` (`wisp serve`: the process without a face — no daemon, Ctrl+C stops). Both faces share the Bridge port + secret; a second host fails loud (EADDRINUSE), no port-hop. `src/claude-wisp.ts` (#64) is the **launcher** bin: probes the Bridge, then spawns `claude` with the env trio on the child only, argv verbatim, exit code mirrored (env assembly = core's pure `buildClaudeLaunch`).
- `.vscode/` — `launch.json` (F5 → Extension Development Host, dev path `packages/vscode`) + `tasks.json` (build task = `bun run compile` in `packages/vscode`).
- `packages/vscode/dist/` — esbuild bundle `extension.js` (core + openai inlined) + `webview/` Vite output (single unhashed `main.js` + `main.css`). Git-ignored. The old root `out/` is gone.
- `CONTEXT.md` — domain glossary (ubiquitous language); owns term definitions like **Activity = Thinking | Idle**.
- Work is tracked as GitHub issues on remote `EstarinAzx/Wisp-Router` (renamed from `Wisp`; old URLs redirect). The old local `PRD.md`/`issues.md` were deleted 2026-07-14 (historical "PRD #N" refs point at them via git history). See [[active-work]].
- Side-panel implementation plan (now executed) lives outside the repo at the agent plan path noted in [[active-work]].

## How to run
- Install: `bun install` (root — one lockfile for all three packages).
- Build: `bun run compile` (root, or in `packages/vscode`) = `tsc -p ./ && tsc -p webview` (typecheck-only) `&& esbuild bundle && vite build`.
- Test: `bun run test` (root → 367 Vitest tests in `packages/core/tests/*.test.ts`; no Electron host).
- TUI: `cd packages/tui; bun run dev` (writes real `~/.wisp`; set `WISP_HOME` to sandbox). Headless Bridge: `bun src/index.tsx serve`. Claude Code through the Bridge: `bun src/claude-wisp.ts [claude args…]` (the `claude-wisp` bin once installed).
- Dev: press **F5** in VS Code → Extension Development Host (the Wisp icon is in *that* window's activity bar).
- Package: `bun run package` in `packages/vscode` (= `vsce package --no-dependencies`; deps are already bundled) → installable `.vsix`.
- Set key: the **Wisp side panel** (activity-bar icon), command **Wisp: Set API Key**, or env `OPENCODE_API_KEY`.

## Where to look first
- Entry point: `packages/vscode/src/extension.ts` — the Inquire command + commands, status bar, shared actions.
- Side panel: `packages/vscode/src/sidePanelProvider.ts` + `packages/vscode/webview/app.tsx`.
- Engine: `packages/core/src/` via the `index.ts` barrel (`@wisp/core`); tests in `packages/core/tests/`.
- What's next (tests, model tuning): [[active-work]].

## Conventions
- Arrow functions by default (project `CLAUDE.md` rule); regular `function` only where `this`/hoisting/generators require it.
- Source files follow an "elucidate" house style: a title banner, a file-top `Depends on / Data shapes` block, section banners, and sparse why-comments. Match it when editing any `packages/*/src` file.
- API keys/OAuth tokens are **never** in VS Code settings — they live in owner-only `~/.wisp/auth.json` (ADR-0002, #59; retired SecretStorage) with per-provider env fallbacks (`OPENCODE_API_KEY`, …).

## Map

- [[stack]] — languages, libraries, env vars
- [[api]] — the extension's command/provider/settings surface + the external Zen API
- [[active-work]] — current handoff state
- [[flows]] — recorded end-to-end code flows
- [[happy-path]] — the Bridge golden-path MVD (design-time user journey)
- [[decisions]] — settled questions (design review + side-panel forks)
- [[gotchas]] — non-obvious traps (chat-as-completer, CSP, two tsconfigs)
