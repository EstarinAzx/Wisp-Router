# Secrets move to ~/.wisp/auth.json (retiring VS Code SecretStorage)

The TUI and the extension must share credentials (API keys + Codex/Anthropic
OAuth tokens), and the TUI cannot read VS Code SecretStorage — so secrets move
to a plain file, `~/.wisp/auth.json`, with owner-only permissions. This
deliberately retires the project's earlier "never plaintext, SecretStorage only"
rule: that rule guarded against world-readable VS Code *settings*, not against a
user-profile dotfile. Precedent: Codex CLI, Claude Code, and opencode all store
auth exactly this way.

Considered: OS keychain (Windows Credential Manager / macOS Keychain) via a
native module — encrypted at rest, but native-binding pain across Bun + Electron
+ three OSes, the flakiest class of dependency, rejected.

Consequences: the extension stops touching SecretStorage entirely; a one-time
migration copies existing secrets over. Two processes may refresh the same OAuth
token — auth.json is the single source of truth, so writes must be atomic and
refreshers re-read before refreshing.
