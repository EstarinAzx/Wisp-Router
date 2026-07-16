---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**Executed the deferred catalog.ts modularization — the 4-file peel — and landed it on `main`
(4 commits, local, NOT pushed).**
- `packages/core/src/catalog.ts` **1293 → 486 lines**. Extracted `shared.ts` (kernel: models.dev
  caps, effort ladder, `parseSseBlock`, tool shapes, `trimmedString`), then `codex.ts`,
  `anthropic.ts`, `xai.ts` (each provider's creds + request/reply + auth.json + caps).
- catalog **re-exports** all four (`export * from './shared'` …), so the `@wisp/core` barrel surface
  is byte-identical — **no sibling or face import changed**. Provider files use `import type
  { Provider }` from catalog (type-only → runtime graph `catalog → provider → shared`, acyclic).
- catalog keeps providers · edit prompt · chat surface · migration · the two dispatchers
  (`oauthModelOptions`, `effortOptionsFor`) · PKCE.
- Gate GREEN each leg: `bun run test` (434) + core/tui/vscode `tsc`. Runtime barrel smoke +
  `bun run dev` + live sign-ins all pass. Decision flipped to executed:
  [[2026-07-15-catalog-ts-modularization-plan-deferred]].

## Next task
**Ready queue empty.** First: decide whether to **push** the 4 peel commits (`4bb4e29`→`7e0de9b`)
— nothing forces it (pure internal refactor, no release/tag). Then pick from the carried backlog:
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. **catalog.ts someday-9 remainder** (deferred, only if it earns it) — split catalog's grab-bag
   further, repoint core siblings to per-concern imports, drop the re-export facade. Low payoff.
3. **Root `.vsix` pile** — stale builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Landmines
- **⚠️ `main` is 4 ahead of `origin/main` (@ `9e56287`)** — the 4 peel commits are unpushed; the
  next context commit stacks on them. (`b4afc6e` + the TS wrap-up ARE now on origin — the old
  "b4afc6e unpushed" note is stale.)
- **⚠️ Provider files must stay one-way:** import ONLY from `./shared` (+ `import type { Provider }`
  from catalog). A value import of catalog, or a `codex ↔ anthropic ↔ xai` cross-import, creates a
  runtime cycle. Kernel helpers used by ≥2 providers belong in `shared.ts`.
- **⚠️ Do NOT git-tag `v1.7.0`** for the extension — `release.yml` fires on `v*` and guards
  tag==`packages/tui` version (2.0.6); a `v1.7.0` tag fails all 4 jobs. Extension ships via `.vsix`.
- **⚠️ Any NEW tsconfig here must set `"types": ["node"]`** or node/DOM globals vanish under TS 7 —
  see [[ts7-drops-types-auto-include-when-types-unset]].
- **npm publish is irreversible** — 2.0.6 spent; next npm release is 2.0.7+.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave the `id:'groq'` row alone.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
