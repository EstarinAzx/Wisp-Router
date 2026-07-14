# Monorepo: packages/core + packages/vscode + packages/tui

The Wisp TUI inherits the exact same engine as the VS Code extension (catalog,
routing map, Bridge, OAuth clients — already vscode-free in `src/`), so the repo
becomes a bun-workspaces monorepo instead of spawning a second repo:
`packages/core` (the engine), `packages/vscode` (the extension, shrinking to VS
Code chat routing only), `packages/tui` (the new face). A separate repo would
force publishing core as a versioned npm package and synchronising every engine
change across two repos — pure ceremony for a solo project. `packages/core` is
never published; each frontend bundles it at build time.

Consequences: the extension's build keeps tsc + vite + vsce but installs via
`bun install`; vsce packaging needs a bundling step since workspace deps don't
exist on the marketplace.

*Amendment (2026-07-14): "shrinking to VS Code chat routing only" no longer
holds — the extension stays a full face (panel + Inquire + Bridge) alongside
the TUI, both over the shared `~/.wisp` store (#66 cancelled; see
`.context/decisions.md` "Panel stays"). The package split itself stands.*
