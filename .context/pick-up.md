---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**wisp-router 2.0.9 released and VERIFIED** — `/providers` submenu hub (#106, `4918cf8`),
palette description wrap (same commit), Advisor endpoint-gate warning on `/bridge`
(`9442718`), bump `cb7007a`, tag `v2.0.9`; npm thin shell + 4 platform packages + GitHub
release assets confirmed live.
- Submenu: Enter on a provider row → Use as Active · Set/Remove API key (keyed) · Sign
  in/out (OAuth); actions return to the list; Esc steps one level; slash commands untouched.
  Remove-key is new. All in `packages/tui/src/app.tsx`.

## Next task
**Ready queue empty.** Pick from the carried backlog:
1. **Publish VS Code extension 1.7.0 to Marketplace** — human step: `vsce publish` in
   `packages/vscode` (EsarinAzx PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. Panel-side alias rename (TUI-only follow-up).
3. Root `.vsix` pile — **ask before purging** · catalog.ts someday-9 (low payoff).

## Landmines
- **⚠️ Do NOT git-tag `v1.7.0`** for the extension — `release.yml` fires on `v*` and guards
  tag == `packages/tui` version. Extension ships via `.vsix` only.
- **⚠️ Advisor is endpoint-gated** — won't route through Wisp even bound to Claude OAuth; no
  code fix, native `claude` for advisor tasks. Don't reopen.
- **⚠️ TUI chrome rule:** every chrome row `wrapMode="none"` + `flexShrink={0}` (or PANEL);
  long copy hand-wraps via `wrapWords`; select descriptions only wrap through WrapSelect —
  the native select renderable hard-clips. See
  [[opentui-rows-garble-on-small-terminals-without-wrapmode-none-and]].
- **⚠️ Provider files stay one-way:** import ONLY from `./shared` (+ `import type { Provider }`).
- **⚠️ New tsconfigs need `"types": ["node"]`** (TS 7 drops auto-include).
- **npm publish is irreversible** — 2.0.9 spent; next release is 2.0.10+.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave `id:'groq'` alone.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
