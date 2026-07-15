---
type: active-work
project: wisp
updated: 2026-07-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-15 by Opus 4.8 (auto)._
_At commit: `89a0898` on `main`. `wisp-router@2.0.5` released to npm; epic #91 + issue #98 closed._

## Current focus
**Nothing in flight.** The Grok (xAI OAuth) provider epic #91 is **fully done and released** —
`wisp-router@2.0.5` is live on npm and the release run is green. Ready queue is empty. Next work is
whatever's picked from the carried backlog below (top candidate: **VS Code extension 1.7.0**, which would
ship the Grok face to extension users — the npm/TUI release is out, the extension is still v1.6.0).

## State
- **Grok epic #91 shipped + released:** #92–#97 merged (`509f753`→`a903981`), #98 release-prep merged (PR #105 → `bee49c6`).
- **Release `wisp-router@2.0.5` (2026-07-15):** tag `v2.0.5` → `bee49c6`; `release.yml` run `29406040823` **GREEN**.
  - `wisp-router@2.0.5` live; all 4 `@tsd47216/wisp-router-{win32-x64,darwin-arm64,darwin-x64,linux-x64}@2.0.5` published (no best-effort fallback needed); shell optionalDependencies pinned to 2.0.5; GitHub release created.
  - NPM_TOKEN was valid (publish clean). Only CI noise: Node 20 deprecation warnings (cosmetic).
- **LIVE-VERIFIED earlier this epic:** grok-4.5 (public api.x.ai) + grok-build (subscription proxy, `x-grok-*` headers) both stream via `claude-wisp`; `grok-cli`/`1.0.0` client tags confirmed.
- **Tests: 431** (`bun run test`); vscode + webview + TUI `tsc` clean.

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty; no committed next task. Pick from the carried backlog (top candidate first):
1. **VS Code extension 1.7.0** — ship the Grok face to extension users. CHANGELOG `[Unreleased]` already holds the Grok entry; extension is still v1.6.0. Separate release path from the npm `wisp-router` TUI.
2. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
3. **Panel-side alias rename** — TUI-only follow-up.
4. **catalog.ts modularization** (DEFERRED, owner will init) — split the ~1,300-line pure core into
   per-concern files, barrel absorbs it. Approach decided: see
   [[2026-07-15-catalog-ts-modularization-plan-deferred]] (4-file peel first, shared-kernel rule, green-to-green).

## Landmines
- **Release rebase trap (bit us this release):** `/preset wrap-up` commits the `.context/` handoff locally but does **not** push it. Next session that context commit diverges from the PR's squash-merge on origin — **rebase local `main` onto `origin/main` and tag the release-prep commit** (the one with the bumped `packages/tui/package.json`), not the context commit. `release.yml` guards tag==version, so a wrong tag fails loud, but reconcile first.
- **npm publish is irreversible** — a burned version can't be reused. (2.0.5 is spent; next release is 2.0.6+.)
- **Grok ≠ Groq** — Grok is `id:'xai'` (OAuth); leave the `id:'groq'` row (Llama, API-key) alone.
- Codex signed out on this machine (`/signin codex` before any Codex live checks).

## Open questions
- (carried) grok-4.5 rides the public `api.x.ai` lane — it *works*, but whether xAI **bills** it under SuperGrok or as metered API usage is unverified (untestable from here).
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- Core files from the epic: `xaiAuth.ts`, `xaiClient.ts`; `xai`/`grok` pure cores in `catalog.ts`; `WispAuth.xai` in `home.ts`; barrel updated. Tests: `xai.test.ts`, `bridgeServer.test.ts`.
- Face wiring: `packages/vscode/src/{extension,chatProvider,sidePanelProvider}.ts` + `webview/app.tsx` + `package.json`; `packages/tui/src/{store,bridge,app}.tsx`.
- Release plumbing: `.github/workflows/release.yml` (tag `v*` → 4-runner matrix build + npm publish); scoped platform pkgs under `packages/tui/npm/`.
- Repo labels: `ready-for-agent` (frontier) / `ready-for-human`. Ready queue **empty**.

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
