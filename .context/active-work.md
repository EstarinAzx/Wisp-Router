---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: 162cdf1 on `feat/tui-2-wisp-home` (PR #71 open), branch pushed._

## Current focus
**TUI slice 2 implemented, awaiting F5 eyeball + merge.** #59 — the **Wisp home store**
(`~/.wisp/config.json` + owner-only `auth.json`, ADR-0002) replaces SecretStorage, globalState, and
the `wisp.*` state settings. PR [#71](https://github.com/EstarinAzx/Wisp-Router/pull/71) closes
[#59](https://github.com/EstarinAzx/Wisp-Router/issues/59) on merge.

## State
- **Done this session (#59, PR #71, branch `feat/tui-2-wisp-home` @ 162cdf1):**
  - core: `home.ts` (schema/migration pures) + `homeStore.ts` (atomic tmp+rename fs layer, 0o600,
    debounced dir watcher) + 27 tests → suite **331/331**; barrel updated.
  - extension: all reads/writes through `WispHome`; three ordered activate migrations (zen→go,
    legacy key, **migrateToWispHome** — user-scope-only seed + copy-then-delete slots); fs watcher
    replaced the config/secrets listeners; auth managers store creds in auth.json with
    re-read-before-refresh + persist-outside-fetch-catch.
  - `package.json` settings trimmed to `maxTokens`/`temperature`; README settings/security rewritten.
  - Review (cavecrew) found + fixed: workspace-injection into the seed (🔴), creds field sanitizing,
    watcher 'error' handler, tmp litter, rotation-persist placement.
  - Verified: `bun run compile` clean (tsc + esbuild 897 KB + vite) · 331/331 Vitest.
- **In flight:** PR #71 — **F5 hand-check NOT done** (needs the real extension host): panel key →
  auth.json, restart rehydrate, migration of an installed profile, Bridge secret reuse.
- **Blocked:** merge waits on that eyeball test.

## Pick up here
See [[pick-up]] — F5 smoke PR #71, merge, then `/preset scope 60` (TUI MVP + `wisp-router` naming).

## Skills for next session
- /preset pick-up → F5 checklist in pick-up.md; then /preset scope for #60.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- Orphaned `wisp.*` entries linger in users' settings.json ("unknown setting") — deliberately not
  auto-removed; revisit only if it confuses users.

## Recent context
- Ticket dependency shape: #58✅→#59(PR #71)→#60, then #61/#62/#63/#65 fan out from #60; #64 behind
  #63; #66 (extension shrink) gated on #61+#63+#65; #67 (release) behind #64.
- #60 gets `WispHome` for free from `@wisp/core` (`WISP_HOME` env override exists for sandboxing).
- npm names: `wisp`/`wisp-cli` taken; package will be `wisp-router`, bins `wisp` + `claude-wisp`
  (naming lands with #60 — tui package is placeholder `@wisp/tui` until then).

## Related
- [[overview]] — core layout + conventions re-anchored to the store
- [[api]] — settings section rewritten (VS Code keeps only maxTokens/temperature)
- [[decisions]] — 2026-07-14 store-execution entry
- [[gotchas]] — key-redirect gotcha rewritten for the store era; dead-knobs trap added
- [[pick-up]]
