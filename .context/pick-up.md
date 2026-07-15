---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**Shipped a Bridge bugfix and released it as `wisp-router@2.0.6`.**
- **Anthropic door now honors `stream:false`** — returns a JSON Messages reply with a `usage` block
  instead of always streaming SSE. Fixes Claude Code `/model <id>` crashing on validation (`undefined is
  not an object (evaluating 'B.usage.input_tokens')`) and **unblocks assigning a Wisp alias to a subagent**.
  LIVE-VERIFIED (`/model kimi` switched clean). (`fix` a932d2a → tag `v2.0.6` → `c75a9e3`.)
- **Release `wisp-router@2.0.6` GREEN:** `release.yml` run `29412769271`; npm + all 4 scoped pkgs @2.0.6 live.
- Also this session: **VS Code extension 1.7.0 prepped** (version+CHANGELOG cut, `wisp-1.7.0.vsix` built —
  NOT published to Marketplace yet), **catalog.ts comments trimmed** (373ea02), and a **deferred
  catalog.ts modularization plan** recorded.

## Next task
**No committed next task — ready queue empty.** Pick from the carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in `packages/vscode`
   (needs the `EsarinAzx` publisher PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. **catalog.ts modularization** (DEFERRED, owner will init) — plan in
   [[2026-07-15-catalog-ts-modularization-plan-deferred]] (4-file peel first, shared-kernel rule, green-to-green).
3. **Root `.vsix` pile** — stale builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Landmines
- **⚠️ Do NOT git-tag `v1.7.0` for the extension.** `release.yml` fires on `v*` and guards
  tag==`packages/tui` version (2.0.6) — a `v1.7.0` tag fails all 4 jobs. Extension ships via `.vsix`/`vsce publish`.
- **npm publish is irreversible** — 2.0.6 spent; next npm release is 2.0.7+.
- **Release rebase trap:** wrap-up commits `.context/` locally; this session's wrap-up commit IS pushed, so
  `main` == `origin/main` — no divergence to reconcile.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave the `id:'groq'` row alone.
- Codex signed out on this machine (`/signin codex` before any Codex live checks).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
