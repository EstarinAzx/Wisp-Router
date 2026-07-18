---
type: pick-up
project: wisp
updated: 2026-07-18
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md`, then continue below.

## Latest (2026-07-18, remote): Anthropic cache TTL fix on a review branch

Branch **`claude/anthropic-cache-ttl-fix`** is pushed and awaiting the user's review → merge → **2.0.20**.
It fixes a real caching bug (TTL flipped 5m→1h between turn 1 and turn 2 of every bridged session, busting
the prefix cache) by fixing the TTL per call path instead of per turn count, and adds a `prompt-cache MISS`
log to the Bridge. Placement logic from #111 is untouched. 513 tests green, both faces typecheck. Details:
[[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]] +
[[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]. Do NOT re-derive the TTL from `convo.length`.

## Where you are

**Side-panel UI refactor shipped.** `wisp-1.7.0.vsix` built and appended to the existing
`v2.0.19` GitHub release; release notes rewritten to cover the extension + GUI refresh. The
vscode extension version is **1.7.0** (independent of the TUI's `wisp-router@2.0.19`). Daily
driver + live bridge remain on 2.0.19 — this session touched only the vscode face.

## What last session did

1. Refactored `packages/vscode/webview/` into a **card** layout (Connection · Model · Bridge ·
   Routing map · Claude Code), `WISP_` gradient wordmark, inline status pills. New CSS
   primitives in `style.css` (`.card` `.brand` `.card-title` `.field-label` `.hint` `.snippet`).
2. **Trimmed the Claude Code card** to mirror the TUI `/bridge` screen — kept launch line +
   plugin nudge + Advisor caveat; **removed the copy-paste env snippet blocks** and all their
   plumbing (they leaked the live secret as plaintext). See decision
   [[2026-07-18-vscode-panel-mirrors-tui-bridge-no-env-snippets]].
3. Packaged + uploaded the vsix, edited the `v2.0.19` release notes.

## Next task

**Nothing code-pending.** Drive normal.

- If a copy-paste Claude Code setup is wanted back, gate it behind a click-to-reveal — the core
  `buildClaudeCodeSnippets` builder is still intact, only the always-on `<pre>` was cut.
- Reopen bridge code only if the usage meter regresses or you build the pre-trim feature.

**Load-bearing invariant:** do NOT remove the cache breakpoints (#111) — silently restores ~10×
plan burn (`2026-07-16-anthropic-cache-breakpoints-are-wisp-placed`).

## Landmines

- **Release checklist order** (release.yml refuses on mismatch): bump
  `packages/tui/package.json` → span-baseline `--update` → tui CHANGELOG → tag == package.json
  version, `v`-prefixed. (This session only appended a vsix asset — no new tag, so the checklist
  didn't apply.)
- **vscode ext version ≠ TUI version.** `packages/vscode/package.json` is 1.7.0; the vsix name
  carries that, not 2.0.19. Bump it in `packages/vscode/package.json` for the next extension build.
- Use the **Edit tool** for any package.json version bump (PS 5.1 `Set-Content -Encoding utf8`
  writes a BOM that breaks the file).
- `bun run package` in `packages/vscode` = `vsce package --no-dependencies` → `wisp-<ver>.vsix`.

## Related

- [[active-work]] · [[overview]] · [[stack]] · [[decisions]] · [[gotchas]] · [[flows]]
- [[2026-07-18-vscode-panel-mirrors-tui-bridge-no-env-snippets]]
