---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**Upgraded the toolchain to TypeScript 7.0.2 (native Go compiler) and landed it on `main`
(`b4afc6e`, local — NOT pushed).**
- `typescript` devDep → `^7.0.2` in core, vscode, tui. Two TS-7 behavior changes absorbed
  **config-only** (zero product-code): `"types": ["node"]` added to the vscode + tui tsconfigs
  (TS 7 stopped auto-including `@types/*`), and a `vite/client` reference in
  `webview/vscode.d.ts` (TS2882 on the `import './style.css'` side-effect import).
- Gate GREEN: `bun run compile` + tui `tsc` + `bun run test` (434). `bun run dev` launched clean.

## Next task
**No committed next task — ready queue empty.** First: decide whether to **push** `b4afc6e`
(nothing forces it — TS is dev-only, no release/tag). Then pick from the carried backlog (top first):
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. **catalog.ts modularization** (DEFERRED, owner will init) — plan in
   [[2026-07-15-catalog-ts-modularization-plan-deferred]].
3. **Root `.vsix` pile** — stale builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.

## Landmines
- **⚠️ Any NEW tsconfig here must set `"types": ["node"]`** or node/DOM globals vanish under
  TS 7 — see [[ts7-drops-types-auto-include-when-types-unset]].
- **⚠️ Do NOT git-tag `v1.7.0` for the extension.** `release.yml` fires on `v*` and guards
  tag==`packages/tui` version (2.0.6) — a `v1.7.0` tag fails all 4 jobs. Extension ships via `.vsix`.
- **npm publish is irreversible** — 2.0.6 spent; next npm release is 2.0.7+.
- **`b4afc6e` is unpushed** — `main` is 1 ahead of `origin/main`; the next context commit stacks on it.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave the `id:'groq'` row alone.
- Codex signed out on this machine (`/signin codex` before any Codex live checks).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
