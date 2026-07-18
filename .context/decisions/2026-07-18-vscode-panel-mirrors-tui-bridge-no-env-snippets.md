---
type: decision
project: wisp
updated: 2026-07-18
tags: [context, decisions]
---

# vscode Claude Code card mirrors the TUI `/bridge` screen — no env snippets

**Decision:** The side panel's **Claude Code** card renders only the facts the TUI `BridgeScreen`
(`packages/tui/src/infoScreens.tsx:29-72`) shows — a `claude-wisp [args…]` launch line, the
wisp-slot plugin nudge, and the Advisor caveat. The three copy-paste **env snippet blocks**
(PowerShell / bash / `.claude/settings.json`, feature #47) were **removed**, along with their
plumbing: `claudeSnippets` on webview `State` + `PanelState`, the `copyClaudeSnippet` host method
and `copyClaudeSnippet` message case, and the `buildClaudeCodeSnippets` import in `extension.ts`.
The pure core builder `buildClaudeCodeSnippets` stays — the TUI and `bridgeAnthropic.test.ts` use it.
**Why:** the snippets rendered the live Bridge access secret (and `ANTHROPIC_API_KEY`) as plaintext
`<pre>` in an always-visible panel — the redesign screenshot showed the key sitting in the sidebar.
The `claude-wisp` launcher wires Claude Code to the Bridge without exposing the secret, and
`code --install-extension` is the install path; the snippets were redundant clutter. The TUI already
dropped the same block (its rows were the widest offender on narrow terminals) — the two faces now
agree on what the Bridge/Claude-Code surface says.
**Reversibility:** easy — the core builder is untouched, so a guarded reveal (click-to-show) could
re-add copy-paste setup without restoring the always-on plaintext `<pre>`. No ADR: reversible in minutes.

## Related

- [[decisions]] — index
- [[active-work]]
- [[flows]] — the TUI Bridge info-panel trace this mirrors
