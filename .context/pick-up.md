---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**/routing narrow-terminal wrap + "Bind Claude subscription models" + README badges +
wisp-router 2.0.7 released** — commits `a07a4ce`..`993e58b` on `main`, tag `v2.0.7` pushed,
user eyeballed and passed.
- WrapSelect (hand-rolled, in `packages/tui/src/app.tsx`) replaced the native select on the
  three /routing screens: descriptions wrap, windowed list with "… N more" markers. Long
  chrome copy + the status line hand-wrap via `wrapWords`.
- Bind row: all four families → anthropic subscription models in one tap; signed out → browser
  sign-in first, bind on success. `claude-fable-5` added to curated ANTHROPIC_MODELS.

## Next task
**Verify the 2.0.7 release landed.** Run 29474723621: builds were 4/4 green, publish job still
queued at wrap-up. Check `npm view wisp-router@2.0.7 version` + `gh release view v2.0.7`.
Publish failed → re-run the job (workflow is re-run safe). Then the carried backlog:
1. **Publish VS Code extension 1.7.0 to Marketplace** — human step: `vsce publish` in
   `packages/vscode` (EsarinAzx PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. Root `.vsix` pile — **ask before purging**.
3. Panel-side alias rename (TUI-only follow-up) · catalog.ts someday-9 (low payoff).

## Landmines
- **⚠️ Do NOT git-tag `v1.7.0`** for the extension — `release.yml` fires on `v*` and guards
  tag == `packages/tui` version. Extension ships via `.vsix` only.
- **⚠️ TUI chrome rule:** every chrome row `wrapMode="none"` + `flexShrink={0}` (or PANEL);
  long copy hand-wraps via `wrapWords`; select descriptions only wrap through WrapSelect —
  the native select renderable hard-clips. See
  [[opentui-rows-garble-on-small-terminals-without-wrapmode-none-and]].
- **⚠️ Headless probes:** `useKeyboard` subscribes a macrotask after commit — poll with real
  timers between keypresses, don't trust `waitForFrame` alone.
- **⚠️ Provider files stay one-way:** import ONLY from `./shared` (+ `import type { Provider }`).
- **⚠️ New tsconfigs need `"types": ["node"]`** (TS 7 drops auto-include).
- **npm publish is irreversible** — 2.0.7 spent once publish lands; next is 2.0.8+.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave `id:'groq'` alone.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
