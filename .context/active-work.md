---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: release-1.6.0 work on `feat/routing-map-row-dropdowns` (#53 + release chores), shipping to
main via PR at wrap-up time._

## Current focus
**v1.6.0 released.** The Routing map arc (#50 PRD) is complete: #51 Family routes, #52 Aliases +
models-list advertising, #53 per-row model dropdowns — all merged to main (PRs #54, #55, and the
#53/release PR). Version bumped to 1.6.0, CHANGELOG entry added, README fully rewritten (was stale at
1.5.0: new repo name Wisp-Router, Routing map section, Bridge de-experimentalized, new setting,
Anthropic tokens in Security). New `.vsix` packaged + GitHub release v1.6.0.

## State
- **Done this session:**
  - **Shipped the stacked pair:** PR #54 (`feat/routing-map-family-routes` — #51 + Anthropic-door
    vision fix) and PR #55 (`feat/routing-map-aliases` — #52), both merged with merge commits.
  - **#53 per-row model dropdowns (demo-verified by user):** every Routing-map row (4 family rows +
    alias add-row) upgrades free-text model → dropdown fed by the row's Provider. New pure
    `oauthModelOptions(p, catalog)` in `catalog.ts` (+4 tests, suite 304/304); `providerModelIds(id)`
    in `extension.ts` (OAuth → models.dev w/ 4s race, keyed → `clientForProvider(p).models.list()`,
    ANY failure → `[]`); `fetchProviderModels`/`providerModels` webview messages (silent empty, no
    error spam); webview caches per Provider per panel session, drops cache when `keyIsSet` flips,
    free-text fallback when no list.
  - **Release 1.6.0 chores:** `package.json` 1.6.0 + repo URL → `Wisp-Router.git` + description
    mentions Claude.ai/Claude Code; CHANGELOG 1.6.0 entry (Routing map ×3 + vision fix); README
    rewritten whole.
- **In flight:** nothing (post-release).
- **Blocked:** nothing.

## Pick up here
1. **TUI PRD for Wisp** via `/preset init` (user-stated order — next line of work).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset init — the TUI PRD is a fresh idea → interview → MVD → spec → tickets.

## Open questions
- Still deferred by design: forced `tool_choice` + `temperature` not threaded on the OpenAI door;
  OpenAI-door Codex strict-tools limit.
- Routing-map Targets + aliases store raw provider ids with no rename migration (deliberate skip).

## Recent context
- Row-dropdown design (#53): one cache entry serves every row sharing a Provider; a row Provider
  switch calls `ensureProviderModels` (one fetch per Provider per panel session); saved family rows
  prefetch on first state push. `rowModelOptions(providerId, current)` prepends the current value when
  absent (same idiom as the main picker) and returns undefined → free-text input.
- Known ceiling: when a list IS available the row offers only listed ids (+current) — a brand-new
  unlisted model needs the list fetch to fail or a temporary Provider de-pick to type free text.
- Git trap hit this session: a commit intended for a fresh branch landed on local main (HEAD had
  slid back between `checkout -b` and the commit — cause unclear); fixed with `git branch -f`.
  Sanity-check `git branch --show-current` right before committing.

## Related
- [[overview]]
- [[api]] — panel message protocol + Routing map rows (updated this session)
- [[decisions]] — 2026-07-13 Routing-map entry (covers the whole arc's design)
- [[gotchas]] — stale-build + dup-panel traps
- [[happy-path]] — "Bridge Routing map" MVD
