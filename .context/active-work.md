---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: b0323ef on `main` (PR #70 merged), pushed._

## Current focus
**TUI slice 1 landed.** Repo is now a bun-workspaces monorepo per ADR-0001:
`packages/core` (engine + 304 tests + barrel `index.ts`, private, consumed as raw TS source —
no core build step) · `packages/vscode` (extension; engine imports rewritten to `@wisp/core`;
esbuild bundles `dist/extension.js` so vsce escapes `workspace:*`) · `packages/tui` (empty
scaffold, real TUI lands in #60). PR [#70](https://github.com/EstarinAzx/Wisp-Router/pull/70)
closed [#58](https://github.com/EstarinAzx/Wisp-Router/issues/58).

## State
- **Done this session (#58, PR #70 → main b0323ef):**
  - `git mv` restructure, history preserved; one root `bun.lock` (package-lock.json deleted).
  - Build re-plumbed: `tsc` typecheck-only, esbuild bundle (core + openai inlined, 889 KB),
    webview vite build unchanged; `.vscode/launch.json`/`tasks.json` → `packages/vscode`.
  - Verified: 304/304 Vitest in core · `vsce package --no-dependencies` → clean 9-file .vsix ·
    F5 hand-checked (panel, chat routing, Bridge, Inquire = v1.6.0).
  - `codexAuth`/`anthropicAuth` stay in `packages/vscode` (they import `vscode.SecretStorage`) —
    see decisions.md 2026-07-14 entry.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**`/preset scope 59`** — TUI slice 2: Wisp home store (`~/.wisp/` + auth.json). #58 unblocked it;
frontier then #60 (TUI MVP) → fan-out #61/#62/#63/#65. Read #59 body first — OAuth two-process
refresh races answered there (atomic writes + re-read-before-refresh).

## Skills for next session
- /preset scope — entry gate for #59.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.

## Recent context
- Ticket dependency shape: #58✅→#59→#60, then #61/#62/#63/#65 fan out from #60; #64 behind #63;
  #66 (extension shrink) gated on #61+#63+#65; #67 (release) behind #64.
- npm names: `wisp`/`wisp-cli` taken; package will be `wisp-router`, bins `wisp` + `claude-wisp`
  (naming lands with #60 — tui package is placeholder `@wisp/tui` until then).
- Dev-flow change: F5 preLaunchTask now runs `bun run compile` in `packages/vscode`; the
  stale-build trap now reads "recompile → dist/, not out/" — gotchas.md updated.

## Related
- [[overview]] — layout section rewritten for the monorepo
- [[decisions]] — 2026-07-14 monorepo-execution entry
- [[happy-path]] — TUI MVD in PRD #57
- [[gotchas]] — stale-build + dup-panel traps re-anchored to packages/vscode
