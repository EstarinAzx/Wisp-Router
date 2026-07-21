---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: c385c04 (v2.0.29 release) + later wrap-ups + this one._

## Current focus

**Nothing in flight — a wire-parity backlog just got filed.** v2.0.29 is shipped
+ installed and verified live (post-release forensics: whole-history fallback
~1/392, better than ~1/70 native — posted on #145). This session compared wisp's
Anthropic-OAuth path against OmniRoute + a live `claude-cli 2.1.216` capture and
filed umbrella **#148** + children **#149–#152**. Nothing implemented yet.

## State

- **In flight:** nothing.
- **Queue (`ready-for-agent`):** **#149** (Tier-1 fingerprint parity — version
  bump + Stainless headers + session-id), **#150** (bootstrap account identity +
  `metadata.user_id`), **#151** (shape-aware `anthropic-beta` 4→12). **#152**
  (cache-diagnosis probe) is `ready-for-human`. Umbrella **#148** tracks all four.
  Older open: #126 (2.0.24 spec umbrella, probably closable) and #69 (backlog).
- **Done this session:**
  1. **Post-release verification of #145.** Forensics over 5 bridged sessions
     (392 requests): 1 cold, ~1/392 fallback (was ~1/7 pre-fix). Posted on #145.
  2. **OmniRoute comparison + live 2.1.216 capture.** Settled that the
     `cc_version` fingerprint is UNVALIDATED (real `c5e` vs wisp recipe `2b0`,
     accepted anyway → version bump is safe). Diffed the full wire; wisp is
     missing `x-stainless-*` (8), `x-claude-code-session-id`, `metadata.user_id`,
     and 8 of 12 `anthropic-beta` flags. Decision file:
     [[2026-07-21-anthropic-oauth-fingerprint-unvalidated]].
  3. **Filed #148–#152** (umbrella + 4 children) with file:line touch points.
- **Blocked:** none.

## Pick up here

**Next: #149 (Tier-1 fingerprint parity, `ready-for-agent`).** Self-contained PR:
bump `CLAUDE_CODE_VERSION` 0.19.0→2.1.216 (`anthropicClient.ts:66`), emit the 8
`x-stainless-*` headers + `x-claude-code-session-id` in `anthropicMessagesHeaders`
(`anthropicClient.ts:71`). Then #150 (bootstrap → account_uuid → metadata),
#151 (beta widen), #152 (probe cache-diagnosis first). Verify with the same
`ANTHROPIC_BASE_URL` capture harness.

Also still open: close #126 if fully shipped; the user-side session-start
cold-write prune (`/preset health`, non-wisp).

## Skills for next session

- `/preset pick-up` — note points here.
- `packages/tui:verify` — project skill for sandboxed CLI verification
  (discovered this session; use for any TUI command-surface change).

## Open questions

- None for the wisp codebase. (The mid-conversation-system beta question is
  answered: the OAuth wire takes positioned `role:system` — claude CLI sends
  it natively.)

## Recent context

- **Capture technique worth reusing:** point `ANTHROPIC_BASE_URL` at a tiny
  local listener that dumps request bodies (never headers — bearer rides
  there) and answers canned SSE; run `claude -p` / `claude -p -c` for
  one/two-turn wire captures. Zero API cost, exact wire shapes.
- Transcript jsonl forensics (per-request `cache_read/creation_input_tokens`,
  dedup by `requestId`) remains the client-side cache audit tool.
- Landmines (still true): `anthropicAttribution` samples the FIRST user
  message; max 4 `cache_control` markers, thinking blocks unmarkable (mark()
  slide); `usage.iterations` last entry = final base pass; builder hoists at
  most ONE leading system message (a second leading one is positioned — see
  #145 review fix).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
