---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (remote session — Anthropic cache TTL fix, branch pending review)._

## Current focus

**Branch `claude/anthropic-cache-ttl-fix` awaiting review** (user merges → releases 2.0.20). Fixes two
Anthropic-caching flaws found by comparing against openclaude (github.com/Gitlawb/openclaude, the OSS
Claude Code):
1. **TTL flip (the real bug).** `buildAnthropicMessagesBody` derived the cache TTL from `convo.length`
   (`>=2 → 1h`, else 5m), so turn 1 of a bridged session sent 5m and turn 2 flipped to 1h — a TTL change
   busts the server-side cache, re-billing the whole system+tools prefix at 2× on turn 2 of every session.
   Fix: TTL is now fixed per call PATH — `anthropicStream` (sessions) → 1h, `anthropicInquire` (one-shot)
   → 5m, haiku always 5m. See [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]].
2. **No cache-break observability.** Added pure `anthropicCacheOutcome`; the Bridge's Anthropic door logs a
   `prompt-cache MISS …` line when a past-first-exchange request reads nothing from cache.

Prior shipped work still stands: side-panel UI refactor `wisp-1.7.0.vsix` on the `v2.0.19` release.

## State

- **In flight:** `claude/anthropic-cache-ttl-fix` pushed, awaiting the user's review + merge → 2.0.20.
  Touches `packages/core/src/{anthropic,anthropicClient,bridgeServer}.ts` + `tests/anthropic.test.ts`
  (513 tests green; `bun run compile` + TUI `tsc` clean). Placement logic from #111 untouched — only the
  TTL value moved from turn-count to call-path, plus the new `anthropicCacheOutcome` miss-logger.
- **Done this session (earlier, already shipped):**
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
