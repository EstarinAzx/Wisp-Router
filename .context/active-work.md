---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Opus 4.8 (auto)._
_At commit: `7e0de9b` on `main` (4 ahead of `origin/main` @ `9e56287` — NOT pushed)._

## Current focus
**Nothing in flight.** This session executed the deferred **catalog.ts modularization — the
4-file peel** (`shared` / `codex` / `anthropic` / `xai`), green-to-green, landed on `main`.
Ready queue empty; next work from the carried backlog below.

## State
- **catalog.ts 4-file peel DONE** (4 commits `4bb4e29` → `b8de90d` → `2980f07` → `7e0de9b`).
  `packages/core/src/catalog.ts` **1293 → 486 lines**; the provider kernel + three providers now
  live in new files. Decision (now executed): [[2026-07-15-catalog-ts-modularization-plan-deferred]].
  - `shared.ts` — kernel: models.dev caps, effort ladder, SSE (`parseSseBlock`), tool shapes, `trimmedString`.
  - `codex.ts` / `anthropic.ts` / `xai.ts` — each provider's creds + request/reply + auth.json + caps.
  - catalog keeps providers · edit prompt · chat surface · migration · the two dispatchers
    (`oauthModelOptions`, `effortOptionsFor`) · PKCE.
- **How it stayed safe:** every provider file depends only on `./shared` + `import type { Provider }`
  (type-only back-edge, erased → runtime graph `catalog → provider → shared`, acyclic). catalog
  **re-exports** the four modules, so `@wisp/core`'s barrel surface is byte-identical — **no sibling
  or face touched an import**, barrel untouched.
- **Gate GREEN each leg:** `bun run test` (434), core+tui+vscode `tsc --noEmit`. Plus a runtime
  barrel smoke (all peeled fns callable across modules), `bun run dev`, and live sign-ins — all pass.
- **Not pushed** — `main` is 4 commits ahead of `origin/main`.

## In flight
None.

## Blocked
None.

## Pick up here
Ready queue empty. First, decide whether to **push** the 4 peel commits to origin (nothing forces
it — pure internal refactor, no release/tag). Then pick from the carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
   **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. **catalog.ts modularization — someday-9 remainder** (deferred, only if it earns it): split
   catalog's grab-bag further (`providers`/`edit`/`chat`/`migration`/`oauth`), then repoint core
   siblings to per-concern imports and drop the catalog re-export facade. Low payoff.
3. **Root `.vsix` pile** — stale packaged builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Skills for next session
(none clearly apply — backlog items are human-step / deferred)

## Open questions
- (carried) grok-4.5 rides the public `api.x.ai` lane — whether xAI bills it under SuperGrok or
  as metered API usage is unverified (untestable from here).
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- The peel used a green-to-green loop: move ONE concern → `bun run test` + typecheck → commit → repeat.
- Re-export facade (`export * from './shared'` etc. in catalog) is the mechanism that kept every
  sibling/face import unchanged; dropping it is the deferred someday-9 cleanup, not required.
- `.context/overview.md` still carries a phantom `M` (LF→CRLF normalization only, no content change).

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
