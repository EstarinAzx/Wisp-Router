---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: 1a2def4 (#155 merge — #151 beta widen on main)._

## Current focus

**#151 DONE + CLOSED + live-verified.** Shape-aware `anthropic-beta` 4→12 merged to
`main` via PR #155 (626 tests green, 4 new; vscode compile + TUI typecheck clean).
`selectAnthropicBetas(model)` in `anthropicClient.ts` replaces the fixed const: 12
tokens (exact 2.1.216 capture set) for 1M-capable non-Haiku models, 11 for non-1M
opus, 10 for Haiku. Live-verified: haiku (10-token header) + opus-4-8 (12-token)
turns both accepted, no 400/429. **The `ready-for-agent` queue is now EMPTY.**

## State

- **In flight:** nothing (#151 merged + closed, breadcrumb posted).
- **Queue:** no `ready-for-agent` tickets. **#152** (cache-diagnosis probe) is
  `ready-for-human` — needs the user to probe first. Umbrella **#148** closes when
  #152 resolves (#149/#150/#151 all done). **#126** closed by the user 2026-07-21.
  **#69** backlog.
- **Done this session (#151, PR #155):** `selectAnthropicBetas(model)` — model-gated
  selection mirroring openclaude `utils/betas.ts`; context-1m as an EXCLUSION gate
  (haiku/claude-3/opus<4-6 out) so sonnet-5/fable-5 inherit it; advisor-tool off
  Haiku; claude-code kept on Haiku (agentic + 429 gate). Decision recorded:
  [[2026-07-21-beta-selection-model-gated-exclusion]].
- **Blocked:** #152 waits on a human probe; #148 waits on #152.

## Pick up here

No code ticket queued. Options, cheapest first:

1. **#152 (cache-diagnosis probe, `ready-for-human`):** the user drives the probe;
   agent assists with the capture harness / transcript forensics when asked. #148
   umbrella closes once #152 resolves.
2. Otherwise ask the user what's next (new spec, #69 backlog, or release).

## Skills for next session

- `/preset pick-up` — note points here.
- `packages/tui:verify` — project skill for sandboxed CLI verification (any TUI
  command-surface change).

## Open questions

- None for the wisp codebase.

## Recent context

- **Live-check technique (confirmed again, cheap):** scratchpad bun script importing
  `anthropicStream` + `selectAnthropicBetas` from core src with stored
  `~/.wisp/auth.json` creds — two tiny turns validated both header shapes against the
  live backend. Complements (does NOT replace) the `ANTHROPIC_BASE_URL` capture
  listener for byte-level inspection.
- The local **openclaude checkout** (`D:\.claude\claude projects\openclaude`) is the
  gating-logic reference for claude-cli behavior (`src/utils/betas.ts`,
  `src/constants/betas.ts`) — version-behind the real 2.1.216 (lacks
  thinking-token-count / fallback-credit / extended-cache-ttl), so live captures beat
  it on token LISTS; it wins on gating STRUCTURE.
- Landmines (still true): refresh/sign-out must keep creds identity fields; max 4
  `cache_control` markers; builder hoists at most ONE leading system message;
  fingerprint hash UNVALIDATED — don't reproduce the real algorithm; keep
  `cc_entrypoint=cli` + UA `(external, cli)`; authoritative wisp cache-health:
  ~1/392 misses post-#145.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[2026-07-21-beta-selection-model-gated-exclusion]]
