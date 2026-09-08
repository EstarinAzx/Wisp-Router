# Changelog

All notable changes to **wisp-router** (the Wisp TUI / CLI, published on npm) are
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes up to 2.0.10 are folded into the product changelog at
`packages/vscode/CHANGELOG.md`.

## [2.1.4] - Unreleased

### Added

- `codex-wisp` launches installed native Codex through the Bridge's Responses endpoint. Source,
  compiled `wisp codex-wisp` and npm commands share the same launcher and binary resolver.
- The visible-history subset supports ordered text/images, ordinary and custom tools, client
  discovery, namespaced follow-up, visible final output and honest error/incomplete/usage handling.
- The launcher preserves saved config/auth, native model selection and tool policy. Provider
  overrides, hosted search and opaque reasoning/compaction replay fail explicitly. See
  [the compatibility guide](../../docs/codex-wisp.md) for exact wire and content limits.

### Verification and surfaces

- Local Windows x64 binary and npm archives are prepared for 2.1.4. Native CLI contract:
  `codex-cli 0.153.4`, isolated homes and deterministic local upstreams; no real-provider
  acceptance claim. All four existing release runners gain compiled dispatch smoke coverage;
  macOS/Linux matrix jobs have not run during this local preparation.
- Shared-core changes enter both terminal builds and newly compiled extension builds. Core and
  terminal regression suites, typechecks and extension compilation are required gates.
- Installed terminal 2.1.3 and extension 1.13.6 are unchanged. Extension version/publication is
  separate; rebuilding its current manifest would bundle new core under the old version.
- Slot plugin unchanged. Release tag, GitHub release, npm publication and global installation
  remain pending; this entry records source/artifact preparation only.

## [2.1.3] - 2026-09-07

### Fixed

- The TUI-hosted Bridge now writes engine logs to `bridge.log`, just like `wisp serve`.
- Idle hosts and failed Bridge starts preserve the active and previous logs. Rotation begins only
  after the host successfully binds its port.
- `wisp log -f` follows replacement files from their beginning, survives the missing-file gap during
  rotation, and retains lines when rotation happens during follower startup.
- `wisp routing set` recognizes an existing Antigravity sign-in instead of reporting a false warning.

### Surfaces

- **npm / TUI / terminal-hosted Bridge: 2.1.3** - all four fixes. The source change is confined to
  `packages/tui`; the core protocol translators are unchanged.
- **VS Code extension: 1.13.6, unchanged.** The existing version is attached to the release as usual.
- **wisp-slot: unchanged.**

## [2.1.2] ? 2026-09-07

### Fixed

- Codex requests through Claude Code's Bridge reuse its validated conversation session ID instead of
  generating a new one on every turn. Independent sessions stay separate; missing or malformed session
  metadata retains isolated per-request IDs.
- Codex keeps later system notes in their original conversation position as developer messages instead
  of rewriting the opening instructions, preserving the earlier prompt prefix for cache reuse.

### Surfaces

- **npm / TUI / Bridge: 2.1.2** ? both Codex caching fixes.
- **VS Code extension: 1.13.6** ? bundles the same core, including its hosted Bridge.
- **wisp-slot: unchanged.** Other providers retain their existing request mapping.

### Notes

- Cache hits still depend on upstream availability. Controlled live requests verified reuse with the
  corrected identity and message ordering; this is not a guarantee of fixed usage savings.

## [2.1.1] — 2026-09-06

### Added

- Codex discovers models directly with the signed-in ChatGPT account. New families and variants appear
  on catalogue refresh without a Wisp release; the upstream visibility flag controls the picker.
- Discovery refreshes on use after 15 minutes and saves the last successful catalogue per account and
  endpoint under `~/.wisp/cache/`. Network failures keep that snapshot; no snapshot falls back to manual
  entry. `wisp models codex --refresh` and the pickers' **Refresh models** action bypass the cache.
- Both terminal model pickers offer **Enter a model id…**, including when discovery succeeds.

### Fixed

- Reasoning levels, defaults, image support and context windows come from Codex metadata. Model-name
  checks and the Codex max→xhigh clamp are removed. Provider-defined effort names survive storage and
  the Bridge; other providers still validate their own supported values.
- Claude Code's `max` reaches Codex as `max` when the model supports it. Unsupported effort values use
  the selected model's advertised default.
- Codex's catalogue summary mode `none` is translated to an omitted Responses field (sending the literal
  value causes a 400). Unknown manual models omit unadvertised optional reasoning settings.
- Codex's `ultra` runtime mode is excluded from Wisp's effort options: it starts Codex multi-agent
  orchestration and is rejected as a literal Responses effort. Ordinary advertised efforts, including
  `max`, remain available per model.
- The client version required by discovery is refreshed from OpenAI's published npm package metadata,
  with the last successful version as an outage fallback. No Codex installation is required.

### Surfaces

- **npm / TUI / Bridge: 2.1.1** — discovery, persistence, model and effort pickers, manual entry, refresh,
  and both Bridge request dialects.
- **VS Code extension: 1.13.5** — carries the same core, catalogue-backed model/capability/effort controls,
  Codex refresh buttons, and editable routing model fields with suggestions.
- **wisp-slot: unchanged** — consumes the Bridge's discovered context window through status.json.

## [2.1.0] — 2026-09-04

**Two instruction fixes on the Bridge door: an Antigravity client error no longer leaves as a 502 that tells
Claude Code to retry it, and a Fable cache stall is no longer reported as a Wisp cache break.**

### Fixed

- **A deterministic Antigravity 4xx answers with its real status instead of `502 provider request failed`.**
  A 502 says "the server broke, retry", so Claude Code retried a request that could never succeed — the
  itemless-array 400 of 2.0.48 was retried ten times, and the storm hid the stable error. A 400 / 401 /
  403 / 404 now rides the same four-field shape #166 gave Codex (`antigravity_bad_request`,
  `antigravity_auth_unavailable`, `antigravity_permission_denied`, `antigravity_not_found`) with the matching
  Anthropic error type, so the client stops retrying and shows the upstream detail. 5xx stays a gateway
  condition on purpose — a real outage must never hide behind a client-error status — and 429 keeps its own
  body classifier.
- **The cache-health log names the known Fable backend re-bill instead of calling it a real history
  re-bill.** On `claude-fable-5-1` the `#162` "prior write not read back" stall fires on roughly a third of
  turns, each 4-16k tokens short, and the old wording sent the user to chase cache breakpoints. It is the
  backend re-billing a slice of its own thinking, not a Wisp cache break: on a Fable/Mythos-family model the
  line now says so and names the control. Log-only; the numbers are unchanged and still printed.

### Surfaces

Derived from `git log v2.0.48..main -- <face-path>` per face, at the cut. Every change in the window touches
`packages/core` alone — core is a bundled dependency, not a published face, so both shipping faces carry
both fixes.

- **npm `wisp-router` 2.1.0** — this release. The Bridge door (`wisp serve`, `claude-wisp`) is where the
  failure status is answered and the cache-health line is logged, so the terminal face carries both.
- **vsix `wisp` 1.13.4** — the extension bundles its own `@wisp/core`, so the picker and native-chat paths
  carry the same two fixes; no `wisp-router` publish can deliver them there.

### Notes

The re-bill was pinned to the backend by a same-session model control rather than by reasoning: one heavy
tool-use bridged session ran both models through the same Bridge, and the growth arithmetic
`read(n+1) = read(n) + creation(n)` held exactly on 40 consecutive Opus 5 turns while the Fable turns beside
them fell short. Three independent checks close the other doors: Claude Code's native request shape is
byte-for-byte the same on both models (driven straight at a recording backend, bypassing Wisp); Wisp's
parse→build round-trip preserves a Fable thinking block's signature byte-for-byte with no `cache_control`
leaked onto it; and the shortfall tracks Fable's much larger per-turn thinking-signature volume. Nothing in
the door can make that backend read its own writes back — only a lower effort (fewer thinking blocks) or
Claude Code's own thinking-clear would shrink it, and both are client-side calls. The gate is a model family,
not a size bound: the shortfall routinely exceeds the prior turn's entire output, so no per-turn bound would
be honest.

## [2.0.48] — 2026-09-04

**A bridged turn on an Antigravity row stops failing whenever any tool declares an array without saying
what is in it.** The upstream rejects such a node outright, and it rejects the whole request — so one
ordinary MCP tool took down every Antigravity turn in the session, at any model, with
`GenerateContentRequest.tools[0].function_declarations[N].parameters…items: missing field`.

### Fixed

- **An `ARRAY` node in an Antigravity tool schema always carries `items` now.** A bare `{"type":"array"}`
  is ordinary JSON Schema for "array of anything", and a 2020-12 `prefixItems` tuple degrades into one
  here because this wire ignores that keyword. Two of the cleaner's own passes can also mint one — a
  `["array","null"]` type list, and an `anyOf` member selected as an array on its declared type alone —
  so the repair runs after them rather than at the entry. Such a node now gets `items: {"type":"string"}`,
  string being the lossless carrier for an unconstrained element.

### Surfaces

Derived from `git log v2.0.47..main -- <face-path>` per face, at the cut. Both commits in the window touch
`packages/core` alone — but core is a bundled dependency, not a published face, so both shipping faces
carry the fix.

- **npm `wisp-router` 2.0.48** — this release. The Bridge door (`wisp serve`, `claude-wisp`) builds the
  request body, so the terminal face is where the failure was seen and where the fix lands.
- **vsix `wisp` 1.13.3** — the extension bundles its own `@wisp/core`, so the picker and native-chat paths
  carry the same fix; no `wisp-router` publish can deliver it there.

### Notes

The upstream's actual rule was established by driving the wire, one tiny turn per candidate shape, rather
than from the proto: `Schema.type` is marked `REQUIRED` there but is **not** enforced.

    {"type":"array"}                            400  …properties[where].items: missing field
    {"type":"array","items":{"type":"array"}}   400  …properties[where].items.items: missing field
    {"type":"array","prefixItems":[…]}          400  …properties[where].items: missing field
    {"type":"array","items":{}}                 200
    {"description":"…"}  ·  {}  ·  {"type":"object"}   200

So only the itemless array is repaired. An interim commit in this window (`efaa249`) also defaulted a
missing `type` on the strength of the proto; the table above is why it was removed again before the cut —
it repaired something the server never rejected. The shipped fix was then proven on the same model in the
same minute: the reported shape answers 400 raw and 200 through the cleaner.

## [2.0.47] — 2026-09-03

**A bridged Claude Code session on a Claude-5 model stops re-billing its whole history every turn.** The
volatile `<system-reminder>` tail Claude Code appends mid-session was placed in the top-level `system`
array. Render order is `tools → system → messages`, so that block sat inside the cached prefix of every
message-level breakpoint: each time the reminder changed, all of those breakpoints missed and the entire
conversation history re-billed as `cache_creation`. On a long session this is O(n²) token spend behind a
stable prefix that looks healthy.

### Fixed

- **The volatile system tail rides as a trailing `role:"system"` turn, behind every message breakpoint,
  on models that accept one (Opus 5, Opus 4.8, the Fable and Mythos 5 families).** A reminder change now
  re-bills only itself; the conversation history reads back from cache. Sonnet and Haiku 400 on a
  positioned `role:"system"` turn (Haiku confirmed on the wire), so there the tail keeps its previous
  system-array placement — unchanged, no new failure. (#363)
- **A real cache re-bill is no longer hidden by a "STALE" diagnosis line.** When the server's cache
  diagnosis was one the bill contradicted, the door logged only the advisory "not a real miss" and
  skipped the whole heuristic — including the `#162` "prior write not read back" line. A genuine per-turn
  tail re-bill therefore reported as nothing wrong. A STALE verdict is untrustworthy by definition, so it
  now falls through to the heuristic; only a non-stale server MISS suppresses it. Log-only. (#156/#162)
- **A turn that reports no quota headers no longer blanks the statusline's quota block.** The active
  Provider was evicted from the quota ledger unconditionally, so a response that omitted the unified
  rate-limit headers destroyed that Provider's last known reading instead of keeping it as the fallback.
  The eviction is now gated on the incoming turn actually carrying meters. (#204)

### Surfaces

Derived from `git log v2.0.46..main -- <face-path>` per face, at the cut. Every commit in the window
touches `packages/core` alone — but core is a bundled dependency, not a published face, so both shipping
faces carry all three fixes.

- **npm `wisp-router` 2.0.47** — this release. The Bridge door (`wisp serve`, `claude-wisp`) is where the
  request body is built and the cache-health line is logged, so the terminal face carries every fix.
- **vsix `wisp` 1.13.2** — the extension bundles its own `@wisp/core`, so the picker and native-chat paths
  carry the same three fixes; no `wisp-router` publish can deliver them there.

### Notes

The re-bill and its fix were reproduced on the live wire before shipping (Haiku, 5m cache, four growing
turns with a changing reminder):

    volatile in system (pre-#363):   read 7610 frozen   creation 3877 → 5793 → 7680
    volatile behind the breakpoints: read 9568 → 13367  creation ~1900 flat

The old shape freezes the read at the stable prefix while creation climbs with the history; moving the
volatile behind every message breakpoint lets the read grow with the history and holds creation to the
new turn alone. The shipped placement (a trailing system turn) is strictly better than the wire proxy
above — it is never persisted into history, so history turns stay byte-stable — but is gated to the
models that accept a positioned system turn.

## [2.0.46] — 2026-09-02

**A Claude model newer than the version Wisp claims to be no longer fails.** `claude-fable-5-1`
released 2026-09-01, appeared in the picker the same day, and answered every turn with a 502 wrapping
a 400. The model was never the problem: the subscription backend enforces the advertised `claude-cli`
version as a **per-model floor**, `-5-1` demands 2.1.251, and Wisp had been claiming 2.1.219 since
2026-07-25.

### Fixed

- **Wisp advertises `claude-cli 2.1.258`, the shipping CLI.** The pin feeds both the `User-Agent` and
  the request body's `cc_version` attribution block, which the backend ties together, so both move as
  one constant. Selecting a model above the old floor returned
  `400 claude_code_version_too_old` naming the minimum it wanted; it now answers 200.
- **The one-tap "Bind Claude subscription models" no longer downgrades `fable`.** Its mapping is a
  hardcoded TUI-local table that the live picker cannot correct, and its `fable` entry still named
  `claude-fable-5`. Anyone who had routed `fable` to `claude-fable-5-1` by hand and then pressed the
  button had that route silently replaced with the older model. It now binds `claude-fable-5-1`.

### Notes

Driven on the live wire before shipping, with a control that had to pass:

    claude-fable-5-1 @ 2.1.219   400  claude_code_version_too_old (wants 2.1.251)
    claude-fable-5-1 @ 2.1.258   200  answered
    claude-opus-5    @ 2.1.219   200  control

The third row is what makes the first two mean anything — it proves the probe harness itself was
sound, so the 400 is the wire's verdict and not a broken request. It is also the evidence that the
bump cannot break an already-accepted request: `claude-opus-5` was passing at the old version and the
`cc_version` hash is unvalidated (#148).

The `anthropic-beta` token list rode both cells **unchanged** and is still the 2.1.216 capture. That
was the open risk — a new model gated behind a new beta as well as a version floor would have turned
this into a different 400 — and the probe closed it: the floor is the advertised version alone.

Nothing was wrong with model discovery. `anthropicModelsFrom` pulls the dropdown live from models.dev
with deliberately no family whitelist, so the new family surfaced by itself; only the client
fingerprint failed to grow up with it. The two pins that went stale — `CLAUDE_CODE_VERSION` and the
bind table — now carry comments naming each other, because a Claude release makes both stale on the
same day.

Known and deliberately not fixed: `ANTHROPIC_MODELS`, the **offline fallback** list, still knows only
`claude-fable-5`. It is unreachable while models.dev answers, which is exactly why the new row showed
up in the picker at all.

### Surfaces

Derived from `git log v2.0.45..main -- <face-path>` per face, at the cut. One commit in the window,
touching `packages/core` **and** `packages/tui`. `packages/vscode` has no commit in the window, but
core is a bundled dependency rather than a published face, so the extension carries the pin regardless
— the two faces ship different subsets of this fix.

- **npm `wisp-router` 2.0.46** — carries **both** fixes. The TUI depends on `@wisp/core` as
  `workspace:*`, so the Bridge door that serves Claude Code gets the version pin, and the one-tap bind
  table lives in `packages/tui` itself.
- **vsix 1.13.1 — cut alongside.** Carries the **version pin only**. The extension bundles its own
  `@wisp/core` copy and hosts a Bridge of its own, so npm can never deliver the pin to it; the bind
  button is TUI-local and has no counterpart in the extension.

## [2.0.45] — 2026-08-14

**Claude Code's `/effort` now reaches Antigravity's tiered models.** Every other Provider already
honoured it; the Antigravity arm took no effort value at all, so a turn ran at whatever depth the
model id implied no matter where the slider sat.

### Changed

- **A `-tiered` Antigravity model takes its reasoning depth from `/effort`.** Claude Code's effort
  level (and, when it sends none, the panel knob) now rides as
  `generationConfig.thinkingConfig.thinkingLevel` with thoughts requested. Driven live before
  shipping: on `gemini-3.7-flash-tiered` the same prompt spends 264 output tokens at `low` and 758
  with visible reasoning at `high`, against 407 before this change.
- **Every other Antigravity model is deliberately untouched.** `gemini-3.6-flash-low`, `-medium` and
  `-high` are three separate models rather than one with a dial, and `gpt-oss-120b-medium` plus both
  Claude rows carry their depth in the name the same way — Antigravity's own client greys its Effort
  control out on exactly those. Wisp lists all twenty-one ids flat, so choosing the row already chose
  the tier; spending `/effort` on it again would silently send `-high` to someone who picked `-low`.
  Those requests are byte-identical to 2.0.44's.
- **Wisp's top two effort rungs fold onto `high`.** This wire offers three stops, so `xhigh` and `max`
  land on `high` rather than putting an unattested value on the wire — the same shape as the existing
  `max`→`xhigh` fold for Codex.

### Notes

Which rows qualify is a **suffix shape test**, not a pinned list, for the same reason the
editor-internal row drop is one: the live model list grows between releases (that is what 2.0.44 was
for), so a `-tiered` row released tomorrow works without a Wisp cut.

Verified against the wire rather than the suite alone — a green suite has missed a dead Antigravity
Provider before. No request shape 400s: the tiered rows at all three stops, and
`gemini-3.6-flash-low`, `claude-sonnet-4-6` and `gpt-oss-120b-medium` all answer 200 unchanged.

### Surfaces

Derived from `git log v2.0.44..main -- <face-path>` per face, at the cut. One commit in the window,
touching `packages/core` alone — but core is a bundled dependency, not a published face, so both
shipping faces carry it.

- **npm `wisp-router` 2.0.45** — the TUI depends on `@wisp/core` as `workspace:*`, so the Bridge door
  that serves Claude Code gains the tier with this publish.
- **vsix 1.13.0 — bump owed and cut alongside.** The extension bundles its own `@wisp/core` copy and
  hosts a Bridge of its own, so the npm publish alone cannot deliver this to the editor face.
- **wisp-slot plugin — untouched**, zero commits in the window.

## [2.0.44] — 2026-08-14

**The Antigravity model list is live.** The picker and `wisp models antigravity` used to show a
thirteen-row snapshot frozen into the code, so a model Antigravity released after that snapshot simply
never appeared. Signed in, both now ask the upstream's own model-discovery route and show what it
answers — a new upstream model appears without waiting for a Wisp release.

### Changed

- **`wisp models antigravity` and the model picker prefer the upstream's own list.** Signed in, the
  Provider's models come from `POST /v1internal:fetchAvailableModels` — the same hosts and mirrored
  headers as a turn, walked daily → production on any failure. The first live drive answered 21 rows
  where the static table holds 13, `gemini-3.7-flash-tiered` among them. Editor-internal rows are
  dropped on shape (`tab_*` tab-completion models, `chat_<digits>` numbered experiments), never by
  pinned id — the roster shifts under us, and a pinned skip list would rot the way the static table did.
- **The static table is now the fallback, not the lineup.** Signed out, offline, or on any upstream
  error, the curated thirteen keep answering — the picker never goes empty and `wisp models` never
  trades a usable list for an error. The table also still carries the per-model output caps; a
  live-listed id outside it goes unclamped rather than refused.

### Notes

The live list is advisory, exactly as the static one was: the upstream lists rows that 400 on every
request shape tried (`gemini-3.1-pro-high` since #186), and they stay listed. The correction path
remains choosing another model, not reshaping the request.

### Surfaces

Derived from `git log v2.0.43..main -- <face-path>` per face, at the cut. One commit in the window,
touching three faces.

- **npm `wisp-router` 2.0.44** — carries the core client (`fetchAntigravityModels`) and the TUI seam
  (`fetchModelList`), so `wisp models` and the terminal picker go live with this publish.
- **vsix 1.12.0 — bump owed and cut alongside.** The extension bundles its own `@wisp/core` copy and
  its panel dropdowns read the same live list (`getState` model options + the Routing-map rows), so the
  npm publish alone cannot deliver this to the editor face.
- **wisp-slot plugin — untouched**, zero commits in the window.

## [2.0.43] — 2026-08-14

**You can read what the Bridge said.** `wisp serve` prints its log to the terminal it runs in, and that
terminal was the only copy: close it, or start the Bridge from somewhere you are not looking, and the
routing decisions, cooldowns and cache diagnoses were gone. The lines now also land in a file, and a new
command reads it from anywhere.

### Added

- **`~/.wisp/bridge.log`, written by `wisp serve`.** Every Bridge log line is appended with an ISO
  timestamp in front of it; the line itself rides through verbatim. Terminal output is unchanged — the
  file is an addition beside it, not a redirect. The serve banner is deliberately **not** mirrored: it
  carries the Bridge access secret, which does not belong in a file. On each serve start the previous
  run's log moves one generation aside to `bridge.log.1`, so a restart never interleaves two runs and the
  run before this one stays readable. One generation, no size or time policy to tune.

- **`wisp log` — read that file from any terminal.** It prints a header naming the file and its last-write
  time, then the log. The header is the point: a log whose last write was three hours ago is a dead
  Bridge, and saying so first stops the contents inviting the wrong conclusion. With no log yet it prints
  one line pointing at `wisp serve` and exits 0.

- **`wisp log -f` follows.** Prints what is there, then streams each appended line until Ctrl+C, reading
  only the new bytes rather than re-reading the file on every tick. If the log rotates underneath a
  follower, it picks up the new one from the top instead of going silent.

  ```
  $ wisp log
  C:\Users\you\.wisp\bridge.log  (last write: 2026-08-14T01:57:05.044Z)
  [2026-08-14T01:56:18.299Z] [bridge] listening on 127.0.0.1:41184
  [2026-08-14T01:57:05.044Z] [bridge] route active 'opus' -> opencode-go
  ```

  Like `routing`, `snapshot` and `providers`, it is renderer-free — the dispatch branch imports node's
  filesystem and `@wisp/core` and never touches the opentui renderer, so it returns immediately with no
  cursor or frame output.

### Notes

The log file is regenerable telemetry, in the same class as `status.json`: it is never protected from
overwrite the way `config.json` and `auth.json` are (#182 guards stores holding what a user cannot
regenerate), and the home-store watcher already ignores it through its existing non-`.json` name filter —
no watcher change was needed, and none was made.

### Surfaces

Derived from `git log v2.0.42..main -- <face-path>` per face, not from the ticket. Re-derived at the cut,
after #203 and #204 also landed in this window.

- **npm `wisp-router` 2.0.43 — the only face this cut changes.** `packages/tui` has exactly one commit
  since `v2.0.42`: `3465c7c` (#202). The writer and the reader are both in the TUI package, so the npm
  publish is what delivers them.
- **vsix — untouched, no bump owed.** `packages/core` and `packages/vscode` both have **zero** commits
  since `v2.0.42`. `wisp log` is a TUI-face command the extension does not host, and the extension bundles
  its own `@wisp/core`, which did not move. It stays at 1.11.0 (still not installed).
- **`wisp-slot` — already shipped, through a different door.** `plugins/slot` has four commits since
  `v2.0.42` (`f565e94`, `3974441`, `3465c7c`, `ca29ebc`), delivered through the plugin marketplace as
  1.7.1 → **1.7.4** and independent of this npm entry. `3465c7c` appears in that list only because the
  #202 squash swept earlier statusline commits into it (a branch cut from an unpushed `main`) — the
  statusline work it carries shipped as 1.7.3, not as part of this release.
- **No face for #204.** The usage-endpoint recon spike shipped no code by design; its verdict was build,
  deferred as #207. Nothing to publish.

## [2.0.42] — 2026-07-30

**The statusline becomes a panel, and stops forgetting.** #171 shipped the readings as a one-line badge —
`[WISP fable→claude-fable-5 ctx 7% 5h 11% 7d 35%]` — a run of numbers with no shape, sat next to other
badges. And they lived exactly one turn: the Bridge overwrote `~/.wisp/status.json` after every bridged
turn, so the moment a route moved from Codex to Anthropic, what Codex had just said about your weekly
limit was gone.

### Changed

- **`wisp-slot` 1.7.0 — the statusline badge is now a block.** Row one is the route; below it, one bar per
  quota window with its percentage and when it refills; below that, a dimmed row per other Provider whose
  limits are known, stamped with the age of the reading.

  ```
  wisp │ opus → claude-opus-5 │ ctx 17% │ anthropic
    5h  ●●○○○○○○○○   16%  ↻ 2:00pm
    7d  ●●●●○○○○○○   35%  ↻ Mon 4:00am
    codex  7d 7% · 5h 0%   3h ago
  ```

  Bars and percentages are colour-scaled on the bands you act on (green / amber / red / spent), so a
  window running out is visible without reading a number. It prints **no leading newline** — the composing
  statusline decides where the block starts, and an unbridged session still prints nothing at all. The
  wiring snippets in `plugins/slot/README.md` changed shape accordingly.

- **A stale snapshot now costs its context reading, not its meters.** Past 30 minutes, or on a model that
  does not match the session's resolved Target, `ctx` still disappears — that number describes a finished
  conversation. The quota rows survive as remembered ones with their age shown: a window belongs to the
  account, not to the conversation.

### Added

- **A quota ledger in the status snapshot.** `status.json` gains a `providers` map — every Provider that
  reported a limit in the last 24 hours, keyed by Provider id, each with the meters it reported and when.
  The Provider serving the current turn is never in the map; it *is* the top-level snapshot, and holding
  both would let a reader render the same wire twice, once stale. Only quota carries across a switch:
  context fill belongs to the live conversation, so another Provider's old percentage would describe a
  window this session is not spending.

- **`WispHome.readStatus()`**, the read half of the snapshot the store could only write before. Unlike
  `config.json` and `auth.json` a snapshot that does not parse is simply replaced — #182's
  never-overwrite rule protects stores holding something the user cannot regenerate, and this file is one
  turn of telemetry.

### Surfaces

- **npm `wisp-router` 2.0.42** — this release. The hosted Bridge (`wisp serve`, `claude-wisp`) starts
  writing the ledger; nothing else in the CLI changes. **The block renders without it** — only the
  remembered-Provider rows need this version.
- **`wisp-slot` 1.7.0** — the reader, and the whole visible half of this entry. Ships through the plugin
  marketplace on merge, independent of the npm publish.
- **vsix** — the extension bundles its own `@wisp/core`, so it gains the ledger when next packaged. It
  also loses a stale `[WISP] statusline badge` mention in the side panel's plugin blurb. **Not cut this
  pass**: 1.11.0 is still the newest build and is not installed yet.

### Notes

- Two Providers report utilization headers: Codex (`x-codex-*`) and Anthropic
  (`anthropic-ratelimit-unified-*`). Grok and Antigravity report none, so they never appear in the
  ledger — inventing a meter for them would be exactly the confident wrong number #171 exists to avoid.

## [2.0.41] — 2026-07-30

**Antigravity** — a sixth Provider, and the first one that reaches Claude Code and the OpenAI-speaking
Bridge on the same day it arrives. Sign in through `wisp`, then drive Gemini from anything that already
talks to Wisp. (#185, tickets #186–#192)

### Added

- **The Antigravity Provider.** A Google Cloud Code wire, reached with a browser OAuth sign-in
  (`/signin antigravity` in `wisp`) rather than an API key. Tokens and the bootstrapped Cloud Code
  project id persist in owner-only `~/.wisp/auth.json` beside the OAuth Providers already there, so the
  sign-in survives restarts and is shared by every face reading that store. Thirteen models with
  per-model output caps; the image-generation row is refused up front, by name, rather than failing
  somewhere inside a stream. (#187, #188)

- **Both Bridge doors answer for it.** The OpenAI door (`/v1/chat/completions`) reaches it through a
  fifth executor record, so anything speaking OpenAI can name an Antigravity model and get a streamed
  answer with working tool calls. The Anthropic door (`/v1/messages`) reaches it through a fourth arm on
  the door's own per-kind chain — **so Claude Code runs on Gemini**, launched the usual way through
  `claude-wisp`. Tool calls carry the upstream's own call ids untouched; Wisp never mints its own.
  (#189, #191)

- **Vision and documents both ride.** This wire takes one attachment shape, so a PDF differs from a PNG
  by mime type alone — an attachment reaching the Anthropic door is forwarded rather than silently
  dropped. Thinking output rides the thinking channel where the door renders it. (#191)

- **Rate limits now answer `429`.** Antigravity is the first Provider to classify its own rate limits, and
  the first whose cooldown horizon comes from what the server actually said rather than a guess. Below the
  instant-retry threshold the failure is left to the existing bounded retry — a blip still retries. At or
  above it, or on an explicit quota-exhausted reason, the door answers `429` and stops retrying, which is
  both true and something a client can act on. (#190)

### Fixed

- **Every rate limit on every Provider used to leave the Bridge as a `502`.** No executor record classified
  anything, so a quota exhaustion was reported as a gateway fault — neither what happened nor actionable.
  The classification path is now live and door-neutral: both doors answer through the same failure path, so
  a Provider that classifies is classified at either one. Other Providers are unchanged pending their own
  records; the widening is additive. (#190)

- **A server-sent event stream framed with CRLF returned an empty answer.** The block splitter matched
  `\n\n` only, which never matches `\r\n\r\n` — so an entire response arrived as one unparseable block,
  every frame was dropped, and the turn completed *cleanly* with nothing in it: silent, and
  indistinguishable from a model that chose to say nothing. Found by driving a real turn, not by the test
  suite, whose fixtures had been retyped and so normalised the line endings away. Codex and Anthropic frame
  with `\n\n` and are unaffected. (#189)

- **Thinking tokens are counted as output.** They are billed as output, and were not being reported that
  way. (#187, #186)

### Surfaces

Which build carries which change — npm is one of three faces, and this release cuts only npm.

- **npm `wisp-router` 2.0.41** (this release) — everything above. Antigravity lives in `@wisp/core`, which
  this package bundles, so the TUI, `wisp serve` and the `claude-wisp` launcher all receive it together.
  This is the face that makes Claude Code on Gemini work.

- **The `wisp` VS Code extension (vsix) — a bump is OWED and is NOT cut here. Tracked as #197.** The
  extension is not a bystander to this work: it constructs `AntigravityAuth` so its Bridge can refresh the
  bundle and bootstrap the project, passes the credential pair into its own `createBridgeServer`, and
  renders the Provider row with a truthful signed-in status read from the shared `auth.json`. It bundles
  its own copy of `@wisp/core`, so **no npm version can deliver any of that** — it stays at **1.10.1**
  until its own vsix is cut. Note this contradicts #192's own description, which assumed the extension face
  was untouched; the code says otherwise, and #197 exists because this section was checked rather than
  copied.

- **The `wisp-slot` Claude Code plugin** — untouched by #185 and nothing is owed. It stays at **1.6.0**.

## [2.0.40] — 2026-07-29

The other half of 2.0.39. That release stopped a **BOM** from destroying a store; this one stops
**anything we cannot read** from destroying it. Same mechanism, rarer trigger, same outcome.

### Fixed

- **A store file Wisp cannot parse is no longer overwritten.** `~/.wisp/config.json` and `auth.json` are
  read-merge-write: the file is read, your change is merged into it, and the whole thing is written back.
  When the read failed, it produced an *empty* result rather than an error — so the write put "empty plus
  your one change" back over the file, and everything else in it was gone. Not ignored: **erased**. 2.0.39
  fixed the commonest cause of that failed read (a byte-order mark); the mechanism behind it stayed live for
  any other cause — a write interrupted by a crash, a truncated file, a typo from hand-editing.

  The write now refuses. A store holding content that cannot be parsed is never overwritten; you get a loud
  error naming the file instead, and the file is left exactly as it was, so whatever is in it can still be
  recovered. Reading stays permissive, so `wisp` still starts and routes on defaults with a broken config —
  you simply cannot *save* over it until it is repaired or moved aside. A missing or empty store is not this
  case and still writes normally, so first run is unaffected. (#182, ADR-0004)

  Note the shape of the failure this replaces: previously a corrupt `auth.json` plus one sign-in silently
  destroyed every other API key and OAuth token you had stored. Now the sign-in fails and the tokens stay on
  disk.

### Surfaces

Which build carries which change — npm is one of three faces, and this release cuts only npm.

- **npm `wisp-router` 2.0.40** (this release) — the fix above, in `@wisp/core`'s home-store layer, so it
  reaches the TUI, `wisp serve` and the `claude-wisp` Bridge launcher together.
- **The `wisp` VS Code extension (vsix) — a matching bump is owed and is cut alongside this one as 1.10.1.**
  The extension bundles its own copy of `@wisp/core`, so no npm version can deliver this to a picker or
  native-chat user. Tracked with this release under #184.
- **The `wisp-slot` Claude Code plugin** — untouched by #182 and nothing is owed. It stays at **1.6.0**.

## [2.0.39] — 2026-07-29

One fix, cut on its own because of what it costs to wait: #181 destroys data, and it landed
just after the 2.0.38 cut. The extension already carries it (vsix 1.10.0), so this release
closes the gap on the face with the most users — anyone running `wisp`, `wisp serve` or
`claude-wisp` from npm.

### Fixed

- **A UTF-8 BOM in a store file no longer erases that store.** `~/.wisp/config.json` and
  `auth.json` were read with a bare `JSON.parse`, which rejects a leading BOM — so the parse
  threw, the whole store was discarded as corrupt above every field guard, and an empty
  object was returned. That verdict was destructive rather than merely lossy, because both
  stores are read-merge-write: the next patch was merged onto that empty object and written
  back over the real file. Editing `config.json` in an editor that saves a BOM and then
  changing a single setting erased every family route from disk; the same path on `auth.json`
  plus one sign-in erased every stored API key and OAuth bundle. Silently, with no error. A
  BOM is not corruption — it is valid UTF-8 and the *default* output of Notepad and
  PowerShell 5.1's `Out-File`/`Set-Content -Encoding utf8`, so a hand-edited store arrives
  with one routinely. It is now stripped before parsing. (#181)

  Deliberately unchanged: a store that is genuinely unparseable still degrades to an empty
  object rather than failing loud. That path is still destructive for the same read-merge-write
  reason, and fixing it changes the contract of a pure function with six callers — tracked as
  its own ticket (#182) rather than smuggled into a BOM fix.

### Surfaces

Which build carries which change — npm is one of three faces, and this release cuts only npm.

- **npm `wisp-router` 2.0.39** (this release) — the fix above. It lives in `@wisp/core`'s
  home-store parser, so it reaches every npm surface at once: the TUI, `wisp serve`, and the
  `claude-wisp` Bridge launcher.
- **The `wisp` VS Code extension (vsix)** — already has it. The extension bundles its own copy
  of `@wisp/core`, so it needed its own build; **1.10.0** shipped this fix along with the rest
  of the #164 harvest that 2.0.38 flagged as owed (#180). Nothing is owed to the vsix here.
- **The `wisp-slot` Claude Code plugin** — unaffected by this fix, and no longer owed anything
  either: **1.6.0** carries the reader half of #171 that 2.0.38 flagged, so the `ctx …%`
  statusline badge now has both halves. Note that a plugin install is a *cache snapshot*, not
  a live pointer — an existing user needs `/plugin update wisp-slot` to actually move.

## [2.0.38] — 2026-07-29

The CLIProxyAPI harvest (#164) — eight tickets whose common thread is that the Bridge now
tells the truth about what a turn cost, what went wrong, and how full the window is. Every
item below reaches the **npm Bridge** (`wisp`, `wisp serve`, `claude-wisp`); the *Surfaces*
section at the end says which ones also need a build this release does not cut.

### Added

- **Auto-compaction works on a bridged session again.** Claude Code sizes compaction off the
  usage a turn reports, and only the Anthropic client ever emitted one — so every Codex and
  Grok turn closed with zeros, the history never compacted, and it grew until Codex rejected
  it with a 502. Both backends already report the counts on the Responses API's terminal
  frame; those are now mapped onto the usage the Bridge carries end to end. A frame with no
  usage block emits no event at all rather than a synthesized zero — the zero is the bug.
  (#165)
- **The same repair for every API-key Provider.** Chat-completions streams omit usage unless
  the request asks for it, so OpenCode Go, Zen, OpenAI, Groq, Mistral, OpenRouter, Ollama,
  KiloCode, Cline and Custom all reported nothing. The Bridge now opts in with
  `stream_options.include_usage` and maps the final chunk. A Provider that ignores the opt-in
  still finishes clean — no usage block means no event, never a zero. (#169)
- **A transient failure no longer costs the whole turn.** A stream that died before its
  terminal frame, an upstream 5xx, or a provider at capacity used to surface as an error, and
  a provider that kept failing kept getting picked. The open-and-prime step now retries with
  bounded, jittered backoff, and a provider that keeps failing is cooled off briefly. Only a
  failure that delivered nothing is retryable — anything the client has already seen is never
  discarded and restarted — and a classified failure, a credential refusal or a client
  hang-up is never retried. The transient cooldown is a separate channel from the quota one,
  so a blip cannot sideline a provider for days and a quota exhaustion cannot be shortened to
  seconds. (#168)
- **Kimi as a Provider.** A Kimi Code subscriber can use that subscription through Wisp
  instead of buying separate API credit. Sign in from the terminal — `wisp` → `/signin kimi`
  — and approve at the printed URL; `/signout kimi` revokes. Kimi is the first Provider that
  authenticates with OAuth but talks the ordinary OpenAI-chat wire, so it routes through the
  keyed executor untouched and inherits the usage reporting above for free. ⚠ Its auth host,
  client id and endpoints could not be verified offline; a wrong value fails loud at sign-in
  with the server's own words. (#170)
- **A live context meter on the Claude Code statusline.** The Bridge writes
  `~/.wisp/status.json` after each bridged turn on the Anthropic door — the turn's real usage
  against the model's window, plus the account's quota utilization read off the response head
  — and the `wisp-slot` statusline renders `ctx 122% 5h 4% 7d 22%`. The percentage is
  deliberately unclamped: a 122% reading is a conversation already past the window and doomed
  upstream, and showing it before the request fails is the point. Nothing is synthesized — a
  Provider that reports no usage or no headers yields a shorter badge, and API-key Providers
  get no context reading at all, since their window is known only from models.dev, which the
  door does not fetch per turn. Needs the marketplace plugin too — see *Surfaces*. (#171)

### Fixed

- **A failed Codex turn now answers with what actually went wrong.** Every failure left the
  Bridge as `502 provider request failed`, and a 502 tells Claude Code the server broke and
  the request is worth retrying — so it retried requests that could never succeed, most
  damagingly an over-window conversation, which only grows on the retry. The four conditions
  the backend actually reports — context too large, invalid thinking signature, previous
  response not found, auth unavailable — are recognised in every wire form they use and
  answered with their own status. Anything unmatched stays a 502: an unknown failure must
  remain a gateway error. (#166)
- **A pre-stream failure is no longer locked into an empty 200.** The doors committed their
  `200` SSE head before the upstream request had run at all — the provider streams are async
  generators, so no IO happens until the first pull. The first event is now pulled ahead of
  the head on every path, which is what makes any status above reachable and what gives the
  retry its clean boundary. (#166, #167)
- **A fresh Codex sign-in that never picks a model completes its turn.** The codex row's
  default was `gpt-5.3-codex`, which the ChatGPT-account path refuses outright: `400 The
  'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account`. The default
  is now `gpt-5.6-sol` (verified 200 by live probe). `gpt-5.3-codex` stays valid for API-key
  callers and stays in the curated dropdown — this is an account-path restriction, not a
  model-existence one. Also reaches the vsix — see *Surfaces*. (#172)

### Changed

- **One `ProviderExecutor` record per Provider kind.** The OpenAI door carried a near-copy
  chat handler per kind, with the keyed path inline as a fourth and the same gateway-error
  catch pasted at five sites; a new backend meant a new handler. It is now one row per kind
  and one handler driving the table, with a single shared gateway-error answer. Internal, and
  behaviour-neutral apart from priming becoming uniform (above). (#167)

### Surfaces

Which build carries which change — npm is one of three faces, and this release cuts only npm.

- **npm `wisp-router` 2.0.38** (this release) — every item above.
- **The `wisp` VS Code extension (vsix) — a matching bump is owed, and is deliberately not
  cut here.** Four of the harvested tickets changed extension-face code that no npm install
  can deliver, because the extension bundles its own copy of the engine: #170 adds the Kimi
  row to the model picker, native chat and Inquire plus the side panel's device sign-in
  state; #172's corrected default is what native chat and Inquire send for a fresh Codex
  sign-in; #165 added the usage-event guard on the extension's own chat path; and #171 wires
  the snapshot into the extension-hosted Bridge. The vsix stays at **1.9.0** in this release
  and the bump is tracked as its own ticket — cutting a second outward-facing release was
  outside what this one authorized.
- **The `wisp-slot` Claude Code plugin** — the *reader* half of #171 lives in
  `statusline/wisp-statusline.js`, which ships through the plugin marketplace, not npm and
  not the vsix. A user on plugin **1.5.0** therefore has the writer without the reader: the
  Bridge will write `status.json` but no `ctx …%` appears on the badge. That bump is owed too
  and is tracked with the vsix one.

## [2.0.37] — 2026-07-25

### Fixed

- **A truncated turn now says so.** Upstream ends a cut-short reply with
  `stop_reason` `max_tokens` / `content_filter` / `refusal`, but the Anthropic door
  hardcoded `sawTool ? 'tool_use' : 'end_turn'` in both the SSE encoder and the buffered
  reducer — so the reason was destroyed at the door and every truncated turn reached
  Claude Code labelled as a clean finish. The reason survived only as a
  `_[Response truncated: <reason>]_` marker appended to the text: prose in the data
  channel, persisted to the transcript and replayed to the model next turn as its own
  words. A new `truncation` stream event carries the reason through to the closing
  `message_delta`, where it outranks `tool_use` — mirroring upstream, which sends
  `refusal` alongside a real `tool_use` block. Observed 15 times between 2026-07-05 and
  2026-07-25, every one at ≥56k context (#163).
- **The visible marker is gated on answer text, not on any content.** The first cut of
  the above suppressed the marker whenever anything was delivered, and thinking counts —
  but the commonest shape on record is a model that spends its budget thinking, emits no
  answer text, then gets refused (5 of the 6 content-bearing cases). Those turns would
  have rendered as a silently empty reply. The marker now survives wherever no answer
  text arrived, and is dropped only once real text exists to pollute. VS Code native chat
  keeps the marker unconditionally — a chat part has no `stop_reason` channel.

## [2.0.36] — 2026-07-25

### Added

- **Opus 5 support.** `claude-opus-5` (2026-07-24) reached the model list on its own —
  `anthropicModelsFrom` reads models.dev live and keeps no family whitelist — but the
  thinking/effort gate did not: `modelSupportsAnthropicEffort` named the Claude 5 family
  member by member (`fable-5` / `sonnet-5`), so every opus-5 turn ran with adaptive
  thinking and `output_config.effort` **silently off** while the panel still offered the
  full low→max ladder. `isClaude5` is now a regex over the family-local version digits,
  so opus-5 joins the effort + xhigh + max sets and a suffixed id (`claude-opus-5[1m]`)
  matches too; `opus-4-5` / `sonnet-4-5` still read as pre-5. opus-5 also leads the
  offline fallback list, becomes the anthropic row's `defaultModel`, and is what the
  TUI's one-tap `opus` family bind now points at. `CLAUDE_CODE_VERSION` 2.1.216 →
  **2.1.219** (the hash is unvalidated, #148, so the bump cannot break an accepted
  request; the beta token list stays the 2.1.216 capture).
- **wisp-slot 1.4.0 — 1M-context spawn for anthropic Targets.** The harness budgets
  context from the model name a subagent was *spawned* with, and a Slot re-routes behind
  its back. When the bound Target is `anthropic/<non-Haiku>`, the skill now spawns with
  the slot family's full Claude id plus `[1m]` (`claude-fable-5[1m]`) instead of the bare
  family word, so compaction is budgeted against the 1M window wisp already requests on
  the wire. The suffix never leaves the harness; non-anthropic Targets keep the bare word.

### Fixed

- **A `[1m]`-suffixed Target no longer 502s.** Claude Code addresses the 1M tier as
  `claude-opus-5[1m]`, but that suffix is a harness-local label — it sets Claude Code's own
  context budget and compaction point and is not a wire model id (live probe: `404
  not_found_error: model: claude-opus-5[1m]`, while the bare id returns 200). Family routes
  always hid this, since the Target pin replaces the inbound model; a Target pinned **with**
  the suffix (a Slot rebind, `wisp routing set opus anthropic/claude-opus-5[1m]`) rode
  verbatim to the backend and came back as a 502. `stripModelTier` now drops a trailing tier
  at one seam — the wire `model` field — leaving routing, logs, caps and the effort gate
  reading the id as typed. Beta selection is untouched by design: the window comes from
  `context-1m-2025-08-07`, which wisp already sends on every non-Haiku Claude request, so a
  bridged session has been 1M on the wire with or without a suffix. (The 200k Claude Code
  shows for a plain `opus` pick is its own local budget — wisp neither sets nor sees it.)

## [2.0.35] — 2026-07-23

### Fixed

- **PARTIAL advisory no longer flags healthy incremental growth (#162).** The #145
  line fired on every multi-turn request writing ≥4k cache-creation tokens — but a
  growing conversation legitimately writes each new turn's content once, and the
  2026-07-23 capture proves the writes are banked (`read(n+1) = read(n) + creation(n)`
  exactly). A per-conversation growth tracker (same key as the #156 diagnosis chain)
  now classifies each turn: prior write read back → silent; prior write NOT read
  back → the line fires with expected-vs-observed evidence (`expected>=N`); first
  sighting → previous wording. The serve log stops crying wolf on the cache working
  as designed.

## [2.0.34] — 2026-07-23

### Added

- **Auto-cooldown + family fallback on usage-limit 429 (#161).** A provider answering
  `429 usage_limit_reached` (live capture: codex, `resets_in_seconds=551032` ≈ 6 days)
  used to eat every routed request as a 502 until the user manually rebound the family
  route to anthropic. The Bridge now parses the reset horizon from the error body, marks
  the provider cooling (in-memory; a Bridge restart clears it), and family-matched
  `claude-*` routes fall back to the anthropic Provider with the requested id pinned
  until the window ends — the same flip the user made by hand, minus the babysitting.
  Explicit provider-id and Alias routes never re-aim; transient (non-usage-limit) 429s
  never start a cooldown; a missing `resets_in_seconds` defaults to 300s so a wrong
  guess self-heals.

## [2.0.33] — 2026-07-22

### Fixed

- **Spurious `system_changed` STALE noise when advisor requests interleave (#158).**
  The advisor tool rides in the request's tools array, so advisor-on and advisor-off
  requests of one conversation are two cached prefix variants — but both shared one
  diagnosis chain, so the server compared each against the other variant's previous
  message and emitted verdicts the bill contradicted. The chain key now folds in the
  tool lineup's names (alongside model + first user turn); each variant chains its own
  previous message, and a variant-flip turn reads as the already-silent null-chain case.
- **STALE advisory states the observable, not one cause (#159).** The line asserted
  "concurrent send named an old previous_message_id", but a prefix-variant flip
  produces the identical bill-contradicts-verdict shape with no concurrency involved.
  It now reads "bill contradicts the verdict: stale compare target (concurrent send or
  prefix-variant flip)".

## [2.0.32] — 2026-07-21

### Fixed

- **Stale server miss verdicts now log as advisory, not MISS (#156).** Two concurrent
  sends can carry the same `previous_message_id` (the second fires before the first
  response's id lands in the chain), so the server diagnoses both against the pre-change
  message — live-captured as back-to-back identical verdicts, the second on a perfectly
  healthy turn. A real miss always surfaces in the bill (missed tokens re-write as
  `cache_creation` or bill as uncached input); a claimed `missed_input` more than double
  the billed total now logs as `prompt-cache diagnosis STALE … not a real miss` instead
  of a false `MISS (server)` line.

## [2.0.31] — 2026-07-21

### Fixed

- **False `prompt-cache MISS (server)` line on undiagnosable turns (#156).** Live
  capture: the backend can answer `cache_miss_reason: {type: 'unavailable'}`
  (missed=0) on a healthy-usage turn — "couldn't diagnose", not a break verdict.
  The diagnosis reader now folds `unavailable` into the no-diagnosis shape (the
  chain id is kept), so the usage heuristic stays the judge on undiagnosed turns.

## [2.0.30] — 2026-07-21

### Added

- **Server-side cache diagnostics on the Anthropic OAuth path (#156).** Every
  OAuth Messages request now rides the `cache-diagnosis-2026-04-07` beta and
  names its previous response id (`diagnostics.previous_message_id`, chained
  per conversation by the Bridge). When the backend diagnoses a broken cache
  prefix, the prompt-cache MISS line reports the server's authoritative
  reason and re-billed magnitude — e.g. `reason=system_changed
  missed_input=6594` — instead of only the usage-number inference. The
  existing heuristic stays as fallback (the server reports nothing on
  PARTIAL-shaped turns and unchained requests). Probe on #152 confirmed the
  subscription backend honors the beta; healthy turns still log nothing.

## [2.0.29] — 2026-07-21

### Fixed

- **Anthropic-door cache re-bill amplifier (#145).** Claude Code sends hook
  reminders as mid-conversation `role:"system"` turns; the door hoisted them
  into the top-level system slot, rendering them ahead of the entire message
  history — every new/changed reminder diverged the prompt right after the
  stable prefix and re-billed the whole history at the 2× cache-write rate
  (measured: a whole-history re-bill every ~7 bridged requests vs ~71 native;
  0.6–1.2M wasted write-tokens per heavy session). Reminders now stay
  positioned in `messages` as `role:"system"` text-block turns (the
  `mid-conversation-system-2026-04-07` beta claude CLI itself advertises), so
  reminder churn re-bills only the tail behind it. Non-Anthropic Targets are
  content-equivalent: OpenAI-compatible backends get the system message in
  place, Codex/xAI fold it into `instructions`.

### Added

- **`partial` cache outcome + advisory log line (#146).** The cache-health
  guard called any frame with a cache read a healthy `hit`, so the #145
  re-bills (8–11 per session, 34k–57k tokens each) never logged a line. A
  read with a ≥4k re-write behind it past the first exchange now logs one
  advisory `[bridge] prompt-cache PARTIAL … (#145)` line next to the existing
  MISS line; healthy sessions still log nothing.

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
