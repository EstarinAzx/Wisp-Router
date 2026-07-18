# Changelog

All notable changes to **wisp-router** (the Wisp TUI / CLI, published on npm) are
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes up to 2.0.10 are folded into the product changelog at
`packages/vscode/CHANGELOG.md`.

## [2.0.16] — 2026-07-18

### Added

- **PDF passthrough on the Anthropic door** — base64 `document` blocks (a dragged-in
  PDF, or Claude Code's Read on a PDF returning pages inside `tool_result` content)
  now ride through the Bridge to Anthropic backends instead of silently vanishing
  from the conversation. Anthropic-door only: a PDF routed to a Codex/xAI/Go target
  is still dropped (those backends don't accept them).

## [2.0.15] — 2026-07-18

### Fixed

- **Cache breakpoints spread across fat tool turns** — Anthropic's cache lookback only
  reaches ~20 content blocks back from a marker, so a heavy parallel-tool turn overshot
  the window and silently re-billed the conversation prefix. The Bridge now walks the
  message history placing a marker every ~15 blocks (within the 4-per-request budget);
  short conversations emit the same single end-of-history marker as before. A marker due
  at a bare-string chat turn slides forward to the nearest markable block, so runs of
  plain turns can't widen a gap past the lookback window. (#111 follow-up)
- **1h cache TTL on Anthropic breakpoints** — reconstructed markers used the 5-minute
  default, so a bridged session's cached prefix expired over an idle gap and re-wrote on
  return. Now `ttl: '1h'`, matching native Claude Code over OAuth.
- **`tool_result.is_error` passthrough** — a failed tool call's explicit error flag now
  rides through the Anthropic door instead of being dropped in normalization.

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
