---
type: pick-up
project: wisp
updated: 2026-07-16
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What last session finished
**`claude-wisp` sets `CLAUDE_BINARY=claude-wisp` on the spawned child** — commit `8129879` on
`main`, pushed. `/relay` loops inside a wisp-launched session now respawn the wrapper instead of
bare `claude` (relay resolution: state file → `$env:CLAUDE_BINARY` → detect → default).
- One line in core's `buildClaudeLaunch` (`packages/core/src/bridgeAnthropic.ts`) + red-first
  test; 434/434 pass; user smoke-tested end-to-end via `bun src/claude-wisp.ts`.
- **Unreleased — riding until 2.0.8** (user decision). Installed compiled binaries don't have
  it yet; the `$env:CLAUDE_BINARY` profile export covers the gap.

## Next task
**Ready queue empty.** Pick from the carried backlog:
1. **Publish VS Code extension 1.7.0 to Marketplace** — human step: `vsce publish` in
   `packages/vscode` (EsarinAzx PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
2. Root `.vsix` pile — **ask before purging**.
3. Panel-side alias rename (TUI-only follow-up) · catalog.ts someday-9 (low payoff).
- Next release = **2.0.8** and should fold in the riding CLAUDE_BINARY change.

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
- **npm publish is irreversible** — next release is 2.0.8+.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave `id:'groq'` alone.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
