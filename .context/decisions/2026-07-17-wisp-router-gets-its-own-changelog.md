---
type: decision
project: wisp
date: 2026-07-17
tags: [context, decision]
---

# wisp-router gets its own changelog

## Decision

TUI/CLI releases are changelogged in **`packages/tui/CHANGELOG.md`** from 2.0.11
onward. The product changelog at `packages/vscode/CHANGELOG.md` stays
extension-versioned (1.x headings, vsce ships it) and folds in wisp-router
changes only up to 2.0.10.

## Why

The two published artifacts version independently (extension 1.x, npm package
2.x). Folding TUI releases into the extension changelog left them sitting in
`[Unreleased]` forever — 2.0.11–2.0.13 (routing CLI, TUI split, ops batch)
ended up changelogged nowhere. One changelog per published artifact; release
prep for a `v2.x` tag updates the TUI file, extension releases update the
vscode file.

## Reversibility

Cheap — merge the TUI file back if the faces ever converge on one version line.

## Related

- [[decisions]]
- [[2026-07-17-slot-plugin-only-session-awareness-hook-badge]]
