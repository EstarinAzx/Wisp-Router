# TUI stack: opentui + Bun, shipped as compiled binaries

The TUI is built with @opentui/core + @opentui/react (React components rendered
to the terminal — same mental model as the Preact side panel it replaces) on the
Bun toolchain, and distributed as `bun build --compile` per-platform binaries
(win-x64, mac-arm64/x64, linux-x64): npm package `wisp-router` is a thin shell
over the platform binary (esbuild/biome pattern), the same binaries attach to
GitHub releases, and the bin commands are `wisp` + `claude-wisp`. Compiling
sidesteps the open question of whether opentui's native renderer runs on plain
Node — users need neither Bun nor a compatible Node installed.

Considered: Ink on Node (plain `npm i -g`, no binaries, boring and proven) —
rejected for opentui's richer rendering; the binary distribution exists to
de-risk that choice.

Consequences: Bun toolchain enters the repo (bun workspaces at the root); a
GitHub Actions release workflow builds the binary matrix; `bun` (not npm) is the
dev install/run entrypoint.
