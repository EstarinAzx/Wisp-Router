---
name: verify
description: Verify Wisp TUI and command-line surfaces through real Bun entry points with an isolated home.
---

# Verify Wisp TUI CLI

Use a temporary `WISP_HOME`; never exercise command changes against real `~/.wisp`.

```bash
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
printf '%s\n' '{"routing":{"families":{"opus":{"providerId":"codex","model":"gpt-5.6-sol"}},"aliases":[]}}' > "$sandbox/config.json"
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing --json
```

Capture stdout and exit codes. Probe malformed or duplicate flags. Renderer-free commands must return immediately without ANSI cursor/frame output.
