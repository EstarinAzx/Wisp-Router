---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**Fixed the TUI's small-terminal garbling and gave the panels a facelift — 2 commits on `main`,
both on origin (`f5ec8bf` + `645f86d`). User eyeballed and passed.**
- Two opentui failure modes, one symptom (rows painted over each other): narrow terminal →
  wrapped row overlays everything after it (`wrapMode="none"` on all chrome rows); short
  terminal → yoga shrinks rows to 0 height but opentui still paints (`flexShrink={0}` on all
  chrome rows + panel boxes). Full trap + headless probe recipe:
  [[opentui-rows-garble-on-small-terminals-without-wrapmode-none-and]].
- Bridge panel: **Persistent settings.json snippet block removed** (claude-wisp is the connect
  path; VS Code side panel still shows the full snippet). Facelift: shared `PANEL` frame
  (rounded dim border + accent title) on all 18 panel boxes, aligned label/value columns.
- Gate GREEN: tui `tsc` + 434 tests + headless `testRender` smokes + user eyeball.

## Next task
**Ready queue empty.** Pick from the carried backlog:
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (needs the `EsarinAzx` PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. **catalog.ts someday-9 remainder** (deferred, only if it earns it) — low payoff.
3. **Root `.vsix` pile** — stale builds; **ask before purging**.
4. **Panel-side alias rename** — TUI-only follow-up.
5. **ScrollBox for the suggestion list** — only if bottom-clipping on tiny windows ever annoys.

## Landmines
- **⚠️ TUI panel-chrome rule:** every chrome row needs `wrapMode="none"` + `flexShrink={0}`
  (or spread `PANEL`) — a bare `<text>` row regresses the small-terminal garble. Only real
  streamed content (/test reply + error) wraps.
- **⚠️ Do NOT git-tag `v1.7.0`** for the extension — `release.yml` fires on `v*` and guards
  tag==`packages/tui` version (2.0.6); a `v1.7.0` tag fails all 4 jobs. Extension ships via `.vsix`.
- **⚠️ Provider files stay one-way:** import ONLY from `./shared` (+ `import type { Provider }`
  from catalog); value import of catalog or provider cross-import = runtime cycle.
- **⚠️ Any NEW tsconfig must set `"types": ["node"]`** — TS 7 drops `@types/*` auto-include,
  see [[ts7-drops-types-auto-include-when-types-unset]].
- **npm publish is irreversible** — 2.0.6 spent; next npm release is 2.0.7+.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave the `id:'groq'` row alone.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
