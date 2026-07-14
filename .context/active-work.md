---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: e332a35 on `main` (PR #71 merged), pushed._

## Current focus
**TUI slice 2 landed.** #59 — the **Wisp home store** (`~/.wisp/config.json` + owner-only
`auth.json`, ADR-0002) replaced SecretStorage, globalState, and the `wisp.*` state settings.
F5 hand-checked by the user, PR [#71](https://github.com/EstarinAzx/Wisp-Router/pull/71) merged.
**Product decision same day: the panel stays — #66 (extension shrink) cancelled**; Wisp is two full
faces (extension GUI + TUI) over the one shared store, SaaS web+mobile style.

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
- **Also this session:** user F5-verified the store live (`~/.wisp` created, panel works) → merged
  PR #71; **#66 closed** (panel + Inquire stay — see decisions.md 2026-07-14 "Panel stays").
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**`/preset scope 60`** — TUI MVP + the `wisp-router`/`claude-wisp` naming, off fresh main.
#60 reads the same `WispHome` from `@wisp/core`; honor `WISP_HOME` env override.

## Skills for next session
- /preset scope — entry gate for #60.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- Orphaned `wisp.*` entries linger in users' settings.json ("unknown setting") — deliberately not
  auto-removed; revisit only if it confuses users.

## Recent context
- Ticket dependency shape: #58✅→#59✅→#60, then #61/#62/#63/#65 fan out from #60; #64 behind #63;
  #66 **cancelled** (panel stays); #67 (release) behind #64.
- #60 gets `WispHome` for free from `@wisp/core` (`WISP_HOME` env override exists for sandboxing).
- npm names: `wisp`/`wisp-cli` taken; package will be `wisp-router`, bins `wisp` + `claude-wisp`
  (naming lands with #60 — tui package is placeholder `@wisp/tui` until then).

## Related
- [[overview]] — core layout + conventions re-anchored to the store
- [[api]] — settings section rewritten (VS Code keeps only maxTokens/temperature)
- [[decisions]] — 2026-07-14 store-execution entry
- [[gotchas]] — key-redirect gotcha rewritten for the store era; dead-knobs trap added
- [[pick-up]]
