---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — vscode side-panel UI refactor + vsix release)._

## Current focus

**None.** Side-panel UI refactor shipped as `wisp-1.7.0.vsix`, appended to the existing
`v2.0.19` GitHub release. Extension version is **1.7.0** (independent of the TUI's 2.0.19).

## State

- **In flight:** None.
- **Done this session:**
  - Refactored the vscode webview side panel (`packages/vscode/webview/`) into a **card**
    layout — Connection · Model · Bridge · Routing map · Claude Code as bordered sections.
    Added a `WISP_` wordmark header (gradient display font) + inline status pills
    (Key set / Signed in / Running) replacing the old `●` text lines. New CSS primitives:
    `.card` `.brand` `.card-title` `.field-label` `.hint` `.snippet`; input/btn radius 2→4.
  - **Trimmed the Claude Code card** to mirror the TUI `/bridge` BridgeScreen: kept a
    `claude-wisp [args…]` launch line, the wisp-slot plugin nudge, and the Advisor caveat;
    **removed the three copy-paste env snippet blocks** (PowerShell/bash/settings.json) and
    all their plumbing — `claudeSnippets` from webview `State` + `PanelState`,
    `copyClaudeSnippet` host method + message case, `buildClaudeCodeSnippets` import in
    extension.ts. Core builder (`buildClaudeCodeSnippets`) left intact (TUI + tests use it).
  - Packaged `wisp-1.7.0.vsix`, `gh release upload v2.0.19`, rewrote the release notes to
    cover the extension + GUI refresh.
- **Verified:** `bun run compile` green (tsc + esbuild + vite, no orphans); release asset
  list shows `wisp-1.7.0.vsix`.
- **Blocked:** None.

## Pick up here

See [[pick-up]]. No code pending. The vsix on `v2.0.19` is the shippable side-panel build.

## Open questions

- The removed env snippets rendered the live Bridge secret as plaintext in the panel — the
  `claude-wisp` launcher + `code --install-extension` path replace them. If someone wants a
  copy-paste setup again, gate it behind a reveal, don't restore the always-on `<pre>`.
- Optional #3 (`skipCacheWrite` for forks) only if the bridge grows shared-prefix side calls.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[flows]]
- [[2026-07-18-vscode-panel-mirrors-tui-bridge-no-env-snippets]]
