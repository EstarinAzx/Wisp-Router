# Claude Code through Wisp

`claude-wisp` launches the Claude Code installed on your PATH. It does not bundle, install or update Claude Code. Exact context profiles require Claude Code **2.1.322 or newer** and an updated, running Wisp Bridge.

## Select a target and its budget

Create an alias in Wisp, then select it at launch:

```sh
claude-wisp --model carbon
claude-wisp --model grok
```

The launcher also accepts Provider IDs and configured Claude family routes. Without `--model`, it uses Wisp's Active Provider and selected model. It reports the target, token budget and metadata source before Claude Code starts. The saved alias name stays unchanged; a generated client ID carries the launch's identity internally.

Codex and Antigravity limits come from their account catalogues. Other targets use available public catalogue metadata, with existing curated fallback data for known Anthropic/Grok IDs. If a usable limit is unavailable, the launcher clearly reports a conservative **128000-token fallback**; that is an assumed budget, not a verified backend limit. Public API capacity does not override account-backed Codex or Antigravity metadata.

The numeric limit is applied to the child process only. A temporary settings file keeps unrelated explicit settings, including permissions, while applying Wisp's transport/model profile; it is removed when the child exits. Real auth files, persistent Claude settings and Wisp routing records are not rewritten. Context-disabling flags or competing transport overrides supplied to the launcher are refused.

## Switch safely

Claude Code's numeric context override is process-wide. A model change does not automatically change that number. Each launch therefore selects one target, and the Bridge rejects another model or a changed route before sending a generation request upstream.

Exit Claude Code, then resume with the new target explicitly selected:

```sh
claude-wisp --resume <session-id> --model grok
claude-wisp --continue --model carbon
```

This preserves native resume handling; Wisp does not kill/restart an active conversation on your behalf. Resuming a conversation that already exceeds the new model's window still depends on Claude Code's compaction and the provider's acceptance. No full-window generation guarantee is implied.

Subagents inheriting the selected model share its budget. Requests for other targets, including explicitly different subagent models or fallback targets, cannot use this launch's profile. Use another launcher session for those targets. Server-side advisor calls retain their separate existing route. Concurrent launcher sessions may use different budgets without changing each other's settings.

Ordinary `claude` sessions configured with Wisp's copied environment snippets remain available. They retain the gateway picker and live switching, but do **not** gain arbitrary exact context budgets from discovery. The Bridge model list cannot communicate those numeric limits to Claude Code.

## Validation

Run `bun packages/tui/tests/nativeClaudeContext.check.ts` with installed Claude Code. It uses a synthetic local Bridge and no real provider credentials, verifies 128K, 400K, 500K and 1M reported windows and routing, and refuses a model switch before upstream generation. Unit and HTTP tests cover profile integrity, unknown metadata, route mutation and settings conflicts. Actual large-context provider acceptance is separate from the client's displayed budget.
