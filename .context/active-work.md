---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 21:15 by Fable 5 (auto)._
_At commit: 0030295 on `feat/live-oauth-model-lists` (PR to main in flight this session)._

## Current focus
**Live OAuth model lists — panel dropdowns + picker caps for Codex/Anthropic now come from models.dev.**
Hardcoded lists went stale (gpt-5.6 Sol/Terra/Luna missing); now both OAuth dropdowns and their context
windows read the already-cached models.dev catalog, curated lists demoted to offline fallback. BRANCH
COMPLETE, demo-verified; wrap-up + ship running.

## State
- **Done this session (4 feat commits on `feat/live-oauth-model-lists` + spec/plan docs):**
  - `codexModelsFrom` / `anthropicModelsFrom` (catalog.ts, tested): models.dev ids, newest-first by
    `release_date`. Codex filter keeps `gpt-5*`/`o3*`/`o4-mini*`, drops `-pro/-nano/-chat-latest/
    -deep-research`; Anthropic drops dated `-YYYYMMDD` snapshots, NO family whitelist. Empty/absent
    catalog → curated fallback (refreshed: +5.6 Sol/Terra/Luna, +claude-sonnet-5).
  - `getState` (extension.ts) races `getModelsDevCatalog()` vs 4s timeout → `modelOptions`; panel never
    stalls offline.
  - chatProvider caps closure prefers `lookupModelsDevCaps(catalog,'openai'/'anthropic',…)` over the
    regex tables → gpt-5.6's real ~1M window in the picker.
  - 282 tests green, tsc+vite clean, live models.dev round-trip smoke passed, user demo-verified
    (Terra/Luna + Sonnet-5/Fable-5 visible, messaging works).
- **In flight:** nothing — PR #49 merged to main (f531082), feature branch deleted.
- **Blocked:** nothing.

## Pick up here
1. If the PR isn't merged yet: check it, merge, consider whether this warrants v1.5.1.
2. Next new work, user-stated: **TUI PRD for Wisp** via `/preset init` (user's words: "before i init for
   the tui i plan for wisp").
3. Also queued: **claude-name routing map** feature idea — per-family aliases so bare Claude ids
   (opus/sonnet/haiku/fable) picked in bridged Claude Code map to chosen Provider+model instead of all
   collapsing to Active Provider (advisor→real Opus, haiku chores→cheap model). File as GitHub issue /
   PRD before building.

## Skills for next session
- /preset pick-up — resume from the note.
- /preset init — the TUI PRD (and/or the routing-map PRD).

## Open questions
- None new. Still deferred by design: forced `tool_choice` + `temperature` not threaded; agent-mode
  vision flake root cause open; OpenAI-door Codex strict-tools limit.

## Recent context
- **Bridge routing truth (re-confirmed live):** bare Claude names (Opus/Sonnet/Haiku/Fable picks, the
  /advisor model, background haiku calls) all send raw `claude-*` ids → Active Provider + its panel
  model. Only named `Provider — model` entries route specifically. User now understands labels ≠ brain.
- Billing: bridged Claude Code can't touch API billing — env "key" is the bridge secret; Anthropic
  provider rides Claude.ai subscription OAuth.
- models.dev carries new ids within hours (gpt-5.6-sol 2026-07-09 was present 4 days later with full
  caps); TTL 30min, one shared cached fetch.
- Codex dropdown from live data is ~21 ids (top: 5.6 family) — long but ordered newest-first; no
  complaints yet.

## Related
- [[overview]]
- [[api]] — panel state (`modelOptions` now models.dev-sourced) + Bridge doors
- [[decisions]] — 2026-07-13 live-lists entry (filter rules, fallback contract)
- [[gotchas]] — stale-build + dup-panel traps (still the F5 landmines)
