# Changelog

All notable changes to **wisp-router** (the Wisp TUI / CLI, published on npm) are
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes up to 2.0.10 are folded into the product changelog at
`packages/vscode/CHANGELOG.md`.

## [2.0.28] — 2026-07-21

### Added

- **Advisor reviewer cost is now visible to Claude Code (#143).** The door runs
  the advisor reviewer itself, but its token usage was discarded — `/cost` and
  session totals under-reported every bridged session that consulted the
  advisor. The reviewer sub-call's real usage now rides out on the closing
  usage frame as openclaude-style `usage.iterations` entries
  (`advisor_message` with the resolved Target model + token counts, then the
  final base pass as the last entry — the slot Claude Code reads as the
  authoritative context window). Live-verified: Claude Code folds the advisor
  tokens into `modelUsage` and `total_cost_usd`. Entries are honest: a
  reviewer Target that reports no usage is omitted rather than logged as
  zeros, plain turns emit no `iterations` at all, and top-level usage (what
  the #111 cache-health guard reads) stays the base pass's alone.

## [2.0.27] — 2026-07-21

### Changed

- **Advisor reviewer transcript is now prompt-cacheable (#141).** The reviewer
  sub-call used to flatten the whole conversation into one text block that grew
  every invocation — zero cache reuse, full re-bill per advisor call. The
  transcript now rides as one text block per serialized turn (`textBlocks` on
  the normalized turn; Anthropic body builder emits per-entry blocks, the
  existing breakpoint walk marks them), so successive advisor calls read the
  shared prefix from cache. Non-Anthropic advisor Targets are unaffected (they
  read the joined text, unchanged).

## [2.0.26] — 2026-07-20

### Fixed

- **Advisor reviewer quarantine restored (#142, a #139 regression in 2.0.25).**
  The reviewer sub-call inherited the new `systemSplit` from the base request,
  and the Anthropic arm preferred it over the quarantine frame — so on
  marker-carrying sessions (every bridged Claude Code session) the reviewer
  received the client's full system prompt instead of `reviewerSystem()`. The
  reviewer request is now built by an explicit, unit-tested
  `buildReviewerRequest` (quarantine system, split stripped, no tools).

## [2.0.25] — 2026-07-20

### Fixed

- **Bridged Claude Code sessions no longer re-bill the whole prompt-cache prefix
  when a `<system-reminder>` lands mid-session (#139).** The Anthropic door used
  to fold every system block into one joined string with its only cache marker at
  the end — each appended reminder mutated the marked block and re-billed the
  entire tools+system+history prefix as `cache_creation` (the observed quota
  spikes). The door now splits at the client's own `cache_control` marker: the
  stable prefix keeps the breakpoint, the volatile tail rides after it as an
  unmarked block, matching native Claude Code's layout. Verified live: a changed
  reminder now re-bills only itself (read 9,385 / write 87 where the old shape
  was read 0 / write 9,400+).
- **The #111 cache-MISS log line now catches the creation-shaped bust.** A
  multi-turn request that read nothing while re-writing a ≥4k-token prefix logs a
  MISS even when `input_tokens` stays tiny.

## [2.0.24] — 2026-07-20

### Added

- **`wisp snapshot` / `wisp snapshot revert` — row-based Routing-map snapshots.**
  Record what a fixed Family route or user Alias points at, and restore it on
  revert. Command decisions live in `@wisp/core` (`runSnapshotCommand`, pure) with
  a thin TUI fs+console edge; the store round-trips in `~/.wisp/config.json`.
  `snapshot` refuses a row already held (the only safety rail); `revert` is
  unconditional and prints the overwritten value.
- **Tab completes the highlighted slash command.** A pure `completeSlash` beside
  `suggestSlash`; Tab fills the command but never runs it, adding a trailing space
  only when the command declares args.
- **Drag-select copy now flashes "Copied to clipboard."** A feedback-row note
  appears after a successful copy; the ~1.5 s clear is generation-gated so a newer
  status (or a second copy) wins over a stale timer.

### Changed

- **The `/bridge` wisp-slot blurb is now a why-explanation.** Claude Code only
  knows Claude names; the plugin bridges that gap. Install line and gold nudge
  color unchanged.
- **The `wisp-slot` plugin goes CLI-native (v1.3.0).** It drives
  `wisp snapshot` / `wisp snapshot revert` instead of hand-written
  `~/.claude/slot/lease-*.json` files; the SessionStart hook and statusline read
  held rows from the Wisp snapshot store, and the badge marker becomes `!SNAP`.
  Requires wisp-router 2.0.24+. The word "lease" retires from the plugin.

## [2.0.23] — 2026-07-19

### Fixed

- **`/show-log` no longer clips long lines.** Route and messages lines were painted
  with `wrapMode="none"`, so anything past the panel edge (the model id on a
  `[bridge] route …` line, the image count on `messages …`) vanished. Lines are
  hand-wrapped with the same `wrapWords` helper the rest of the TUI uses, so the
  full text stays readable inside the scrollbox.

### Changed

- **Model-swap lines stand out in `/show-log`.** Lines that start with
  `[bridge] route ` render in a sky accent (`LOG_ROUTE`); other traffic stays dim.
- **The wisp-slot plugin recommend blurb on `/bridge` is gold (`#D59D24`).** The
  advisor note under it stays dim so the install nudge is the one that pops.
- **Drag-selecting text copies it to the clipboard.** opentui already painted the
  highlight; the shell now listens for finished selections and copies via OSC 52,
  falling back to `clip.exe` on Windows when the terminal rejects OSC 52.

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
