---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE + CLOSED): #151 — shape-aware `anthropic-beta` 4→12.**

- Merged to `main` via PR #155 (merge `1a2def4`). 626 tests green (4 new), vscode
  compile + TUI typecheck clean. Touched: core `anthropicClient.ts` + `anthropic.test.ts`.
- **Live-verified + closed:** haiku turn (10-token header) and opus-4-8 turn (full
  12-token 2.1.216 capture set) both accepted by the subscription backend — no
  400/429. Breadcrumb on #151.
- Decision recorded: [[2026-07-21-beta-selection-model-gated-exclusion]] — context-1m
  is an exclusion gate; Haiku keeps claude-code; inbound beta passthrough deliberately
  not built.

**Next task: NONE queued — the `ready-for-agent` queue is empty.**

- **#152** (cache-diagnosis probe) is `ready-for-human`: the USER drives the probe;
  assist with the capture harness / transcript forensics when asked.
- Housekeeping available now: ask the user whether **#126** (2.0.24 spec umbrella) is
  fully shipped → close; **#148** umbrella closes once #152 resolves.
- Otherwise ask what's next (new spec, #69 backlog, or a release).

**Landmines:**

- `selectAnthropicBetas` gates are EXCLUSION lists on purpose (see the decision) —
  don't "fix" them into allowlists; new model families must inherit the wide set.
- Refresh/sign-out must keep the creds identity fields (`refreshIfNeeded`
  destructure-rest, sign-out keeps `deviceId`) when touching `anthropicAuth.ts`.
- Keep `cc_entrypoint=cli` + UA suffix `(external, cli)`; fingerprint hash is
  UNVALIDATED — don't reproduce claude's real algorithm.
- Cheap live-check: scratchpad bun script calling `anthropicStream` with stored
  `~/.wisp/auth.json` creds (one haiku turn). Byte-level: the `ANTHROPIC_BASE_URL`
  capture listener. See active-work Recent context.

## Related

- [[active-work]]
- [[overview]]
- [[2026-07-21-beta-selection-model-gated-exclusion]]
