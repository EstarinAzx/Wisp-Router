# Wisp

BYOK model router — bun-workspaces monorepo.

| Package | What |
|---|---|
| [`packages/core`](packages/core) | The engine: Provider catalog, routing map, Bridge, OAuth clients. Private, never published — each face bundles it at build time. |
| [`packages/vscode`](packages/vscode) | The VS Code extension ([README](packages/vscode/README.md)). |
| [`packages/tui`](packages/tui) | The Wisp TUI + headless Bridge + `claude-wisp` launcher. Ships on npm as [`wisp-router`](https://www.npmjs.com/package/wisp-router) (`npm i -g wisp-router` → bins `wisp` + `claude-wisp`, compiled per-platform binaries — no Bun/Node runtime needed). Released by tagging `v*` (the `Release` workflow builds the 4-target matrix + publishes). |

```sh
bun install        # root — one lockfile
bun run test       # 304 Vitest tests (packages/core)
bun run compile    # typecheck + bundle + webview build (packages/vscode)
```
