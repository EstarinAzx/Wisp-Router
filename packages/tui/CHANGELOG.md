# Changelog

All notable changes to **wisp-router** (the Wisp TUI / CLI, published on npm) are
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes up to 2.0.10 are folded into the product changelog at
`packages/vscode/CHANGELOG.md`.

## [2.0.22] — 2026-07-19

### Fixed

- **The native Advisor no longer 400s mid-turn on a real session.**
  `buildAnthropicMessagesBody` placed its #111 cache-control breakpoints by mutating
  the caller's `rawContent` thinking-sidecar array in place. The advisor flow builds the
  request up to three times from the *same* turns (base pass → reviewer → continuation),
  so a breakpoint written on one build leaked back into the turns and stacked on the next
  — eventually exceeding Anthropic's cap ("A maximum of 4 blocks with cache_control may be
  provided. Found 5.") and tearing the stream with a mid-response error. Replayed thinking
  sidecars are now copied, with any `cache_control` stripped (Anthropic rejects it on
  thinking blocks regardless), so every build is independent and the marker count stays
  within the cap.
- **The Advisor reviewer no longer echoes the conversation instead of reviewing it.** The
  reviewer sub-call forwarded the base model's entire system prompt — including Claude
  Code's own `# Advisor Tool` instructions — plus the raw turns, so a reviewer (even real
  Opus) could parrot those meta-instructions back rather than give a second opinion. The
  reviewer now gets a dedicated, quarantined system prompt and the conversation flattened
  into a single plain-text transcript (structured tool / thinking / image blocks removed),
  which also keeps its request well under the cache cap. The reviewer is text-only as a
  result — pasted images are summarized as `[N image(s) omitted]`.

## [2.0.21] — 2026-07-19

### Added

- **Claude Code's native Advisor now works through the Bridge.** The Advisor is a
  server-executed tool: the model emits an `advisor` call and waits for the *server*
  to run a stronger reviewer and hand back the verdict. Through Wisp the server is the
  Bridge — which never played that role, so the call dangled and the model reported
  "advisor tool not there." The Anthropic door now fulfills it: it forwards an
  `advisor` tool to the base Target, and when the Target calls it, runs a separate
  reviewer pass over the conversation (the model chosen in `/advisor`, routed through
  your Routing map — any Target can advise any other), streams the result back for the
  native Advisor UI, then resumes the base turn with the advice in context. The
  `claude-wisp` launcher and the copy-paste setup snippets now set
  `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1` so `/advisor` is offered for the
  `claude-wisp-*` model aliases (which carry no advisor rank in Claude Code's catalog,
  the client-side gate that otherwise keeps the tool from ever being sent). The old
  `/bridge` and side-panel warning that the Advisor was "endpoint-gated, use native
  claude" is removed — that root cause was wrong; a Bridge session is first-party, and
  the only missing piece was Wisp playing the server role.

## [2.0.20] — 2026-07-19

### Fixed

- **Anthropic cache TTL no longer flips mid-session** — the cache TTL on the #111
  breakpoints was derived from this request's turn count (`≥ 2` turns → `1h`, else
  `5m`), so turn 1 of a bridged session wrote `5m` and turn 2 flipped to `1h`. A TTL
  change rewrites `cache_control` and busts the server-side prompt cache, re-billing
  the whole system+tools prefix at the 2× write rate on turn 2 of **every** session.
  The TTL is now fixed per request **path**: `anthropicStream` (Bridge sessions +
  native chat) → `1h`, `anthropicInquire` (one-shot) → `5m`, haiku always `5m`. The
  #111 breakpoint placement is unchanged — only the TTL value moved from turn-count to
  call-path.

### Added

- **`prompt-cache MISS` log on the Bridge's Anthropic door** — a pure
  `anthropicCacheOutcome` classifier (`hit`/`fresh`/`miss`/`none`) over the wire's
  token usage; the door logs one line when a past-first-exchange request reads nothing
  from cache while billing a large uncached input (the #111 regression shape). The
  observability that cache regression previously had none of.

## [2.0.19] — 2026-07-18

### Changed

- **Cheaper cache writes on one-shot Anthropic bodies** — Inquire / probe / first-turn
  requests now place bare `{ type: 'ephemeral' }` markers (5-minute TTL, 1.25× write
  cost). Multi-turn bodies (`≥ 2` user/assistant turns after system strip) still use
  `ttl: '1h'` so an idle gap mid-session doesn't force a full prefix rewrite. The
  #111 breakpoints themselves are unchanged — only the TTL on them is conditional.

## [2.0.18] — 2026-07-18

### Added

- **Real token usage on the Anthropic door** — the Bridge used to synthesize
  `usage: { input_tokens: 0, output_tokens: 0 }`, so the wisped client's token/cost
  meter read zeros and cache reads were invisible. The backend's real usage now rides
  end-to-end: the door forwards the live `message_start` snapshot (real input +
  `cache_creation` / `cache_read`) and the final `message_delta` counts instead of
  fabricating them. A warm bridged call now surfaces its true `cache_read` on the
  client meter — which also makes the always-1h cache write premium measurable for the
  first time.

## [2.0.17] — 2026-07-18

### Added

- **Thinking passthrough on the Anthropic door** — `thinking` / `redacted_thinking`
  blocks now round-trip client ↔ Anthropic instead of dying inside the Bridge in both
  directions. Outbound: a thinking-bearing assistant turn keeps its original block
  array as a byte-for-byte sidecar and replays it verbatim (signatures + interleaved
  order intact; the client's own `cache_control` markers are shed so Wisp's breakpoint
  budget holds). Inbound: the door's SSE encoder and non-streaming reply forward
  thinking block starts, deltas, signatures, and redacted blocks live — including the
  OAuth wire's empty-text signed thinking blocks. Tool calls now yield at their stream
  position (not folded at stream end) so interleaved thinking order survives the round
  trip. A thinking-only turn is delivered content, not an "empty response" 502.
  Non-Anthropic targets and the OpenAI door drop thinking silently, as with images.
- **Claude 5 effort support** — `claude-fable-5` / `claude-sonnet-5` now receive
  adaptive thinking + `output_config.effort` (live-probed: accepted through `xhigh`
  and `max`). Previously the effort regexes predated Claude 5, so /effort was silently
  dropped on the default model — which also kept the thinking replay gate closed there.

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
