# Changelog

All notable changes to **wisp-router** (the Wisp TUI / CLI, published on npm) are
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes up to 2.0.10 are folded into the product changelog at
`packages/vscode/CHANGELOG.md`.

## [2.0.14] — 2026-07-17

### Added

- **Bridge screen recommends the `wisp-slot` Claude Code plugin** — a nudge where Claude
  Code gets wired, so users learn bridged sessions can get the session announcement, the
  `[WISP]` statusline badge, and the Slot skill
  (`/plugin marketplace add EstarinAzx/Wisp-Router`).

## [2.0.13] — 2026-07-17

### Added

- **`/bridge` ensure-on + `/bridge off`** — `/bridge` starts the listener when it's down
  instead of only reporting it, and `/bridge off` stops it from the palette. (#121)
- **`/show-log` — the Bridge log Screen** — a ring buffer captures Bridge traffic lines;
  the Screen tails them with auto-follow and scroll-to-pause. (#122)
- **Headless `wisp providers` + `wisp models <provider>`** — catalog and live model
  snapshots from the command line, no TUI entered. (#123)

## [2.0.12] — 2026-07-17

### Added

- **Mouse on selects** — draggable scrollbar (captured at mousedown, 2-cell grab zone),
  wheel scroll, and row click.
- **Span-diff baseline harness** — renders every Screen and diffs styled spans against
  committed baselines, guarding the split below. (#115)

### Changed

- **TUI split into Screen modules** — modes/theme/widgets foundations, provider flows,
  routing flows, palette/test/info Screens; `app.tsx` is the shell only. Internal
  refactor, behaviour unchanged. (#114, #116–#119)

### Fixed

- **Transparent select backgrounds** — native selects match the hand-rolled WrapSelect
  look instead of painting an opaque slab.

## [2.0.11] — 2026-07-17

### Added

- **`wisp routing` CLI** — headless text/JSON snapshots of the Routing map (#108), plus
  validated `routing set` / `routing unset` writes for Family routes and Aliases; accepted
  edits persist atomically, missing credentials warn without refusing. (#112)
