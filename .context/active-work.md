---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: 8f2ebf2 (#154 merge — #150 account identity on main)._

## Current focus

**#150 DONE + CLOSED + live-verified.** Bootstrap account identity + `metadata.user_id`
merged to `main` via PR #154 (622 tests green, vscode compile + TUI typecheck clean).
Live-verified twice: (1) real `/signin` through the dev TUI filled the anthropic auth
slice with the real `account_uuid`/email/`default_claude_max_5x` and the `/providers`
row shows `khitarashi@gmail.com · Max 5x`; (2) a post-merge haiku turn through
`anthropicClient` was accepted by the live backend (reply flowed, no 429) with the new
`metadata.user_id` body. Next code ticket: **#151**.

## State

- **In flight:** nothing (#150 merged + closed, breadcrumb posted).
- **Queue (`ready-for-agent`):** **#151** (shape-aware `anthropic-beta` 4→12). **#152**
  (cache-diagnosis probe) is `ready-for-human`. Umbrella **#148** tracks all — #149 and
  #150 are done, so #148 closes when #151/#152 resolve. Older open: #126 (2.0.24 spec
  umbrella, probably closable) and #69 (backlog).
- **Done this session (#150, PR #154):**
  1. **Part 1:** `fetchAnthropicBootstrap` in `anthropicAuth.ts` (best-effort GET
     `/api/claude_cli/bootstrap`, 10s timeout, failure never blocks sign-in); `signIn`
     persists accountUuid/email/org/tier + a per-install 64-hex `deviceId`; refresh
     carries identity over the rebuild; sign-out keeps `deviceId`; `home.ts` sanitizer
     takes the 5 new string fields.
  2. **Part 2:** every Messages request sends `metadata.user_id`
     (`anthropicUserId` pure + `userId` arg on `buildAnthropicMessagesBody`);
     `session_id` = the #149 header UUID; pre-#150 creds degrade to per-process
     device id + derived account uuid (never absent metadata).
  3. **UI:** TUI provider rows + side panel show `you@email · Max 5x`
     (`anthropicAccountLabel`).
  4. Decision recorded: [[2026-07-21-session-id-per-process-metadata-identity]].
- **Blocked:** none.

## Pick up here

**Next: #151 (shape-aware `anthropic-beta` 4→12, `ready-for-agent`).** Widen the
`ANTHROPIC_BETA` header in `anthropicClient.ts` toward the 12 tokens real claude 2.1.216
advertises — see the issue for the shape-aware list and which tokens are request-shape
conditional. Then #152 (probe cache-diagnosis first, `ready-for-human`). Also: #126
probably closable; #148 umbrella closes after #151/#152.

## Skills for next session

- `/preset pick-up` — note points here.
- `packages/tui:verify` — project skill for sandboxed CLI verification (any TUI
  command-surface change).

## Open questions

- None for the wisp codebase.

## Recent context

- **Live-check technique (new, cheap):** a scratchpad bun script importing
  `anthropicStream` from core src with the stored `~/.wisp/auth.json` creds + one haiku
  turn = live backend-acceptance check for any anthropic wire change (~1 haiku turn of
  plan quota, no bridge/VS Code needed). Complements (does NOT replace) the
  `ANTHROPIC_BASE_URL` capture harness for byte-level wire inspection.
- **Capture technique worth reusing:** point `ANTHROPIC_BASE_URL` at a tiny local
  listener that dumps request bodies (never headers — bearer rides there) and answers
  canned SSE; run `claude -p` / `claude -p -c` for one/two-turn wire captures.
- Transcript jsonl forensics (per-request `cache_read/creation_input_tokens`, dedup by
  `requestId`) remains the client-side cache audit tool. To attribute cache stats to
  wisp, capture from the BRIDGE side (serve stdout), not the claude-cli transcript;
  authoritative wisp cache-health number: ~1/392 misses post-#145.
- Landmines (still true): `anthropicAttribution` samples the FIRST user message; max 4
  `cache_control` markers, thinking blocks unmarkable (mark() slide); `usage.iterations`
  last entry = final base pass; builder hoists at most ONE leading system message;
  fingerprint hash UNVALIDATED — don't reproduce the real algorithm; keep
  `cc_entrypoint=cli` + UA `(external, cli)`.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
