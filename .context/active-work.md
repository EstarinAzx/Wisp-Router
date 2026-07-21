---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: eece31d (#153 merge — #149 fingerprint parity on main)._

## Current focus

**#149 DONE + CLOSED + live-verified.** Tier-1 fingerprint parity merged to `main`
via #153 (605 tests green, compile clean). Live-verified: the dev bridge served a
real bridged Fable-5 session via the Anthropic OAuth path — turns flowed, no 429,
so the 2.1.216 fingerprint is accepted by the live backend. Next code ticket:
**#150**.

## State

- **In flight:** nothing (#149 merged + closed).
- **Queue (`ready-for-agent`):** **#150** (bootstrap account identity +
  `metadata.user_id`), **#151** (shape-aware `anthropic-beta` 4→12). **#152**
  (cache-diagnosis probe) is `ready-for-human`. Umbrella **#148** tracks all.
  Older open: #126 (2.0.24 spec umbrella, probably closable) and #69 (backlog).
- **Done this session (earlier):**
  1. **Post-release verification of #145.** Forensics over 5 bridged sessions
     (392 requests): 1 cold, ~1/392 fallback (was ~1/7 pre-fix). Posted on #145.
  2. **OmniRoute comparison + live 2.1.216 capture.** Settled that the
     `cc_version` fingerprint is UNVALIDATED (real `c5e` vs wisp recipe `2b0`,
     accepted anyway → version bump is safe). Decision file:
     [[2026-07-21-anthropic-oauth-fingerprint-unvalidated]].
  3. **Filed #148–#152** (umbrella + 4 children) with file:line touch points.
- **Done this session (#149):** version bump 0.19.0→2.1.216 (feeds UA +
  cc_version block), 8 `x-stainless-*` headers, per-process
  `x-claude-code-session-id`, `anthropic-dangerous-direct-browser-access`,
  POST `/v1/messages?beta=true`. All in `anthropicClient.ts` + tests. Kept
  `cc_entrypoint=cli` / UA `(external, cli)`. Breadcrumb posted; left OPEN.
- **Blocked:** none.

## Pick up here

**Next: #150 (bootstrap account identity + `metadata.user_id`, `ready-for-agent`).**
Needs the bootstrap fetch (part 1) first for `account_uuid`; `metadata.user_id.
session_id` MUST equal the `x-claude-code-session-id` #149 added
(`CLAUDE_CODE_SESSION_ID` const in `anthropicClient.ts`). **Decide there** whether
that id should be per-conversation, not per-process — one `wisp serve` can serve
many Claude Code conversations that would share one id, unlike real claude. Then
#151 (beta widen), #152 (probe cache-diagnosis first).

Also: land/close #149 once the live re-capture passes; close #126 if fully
shipped; the user-side session-start cold-write prune (`/preset health`, non-wisp).

## Skills for next session

- `/preset pick-up` — note points here.
- `packages/tui:verify` — project skill for sandboxed CLI verification
  (discovered this session; use for any TUI command-surface change).

## Open questions

- None for the wisp codebase. (The mid-conversation-system beta question is
  answered: the OAuth wire takes positioned `role:system` — claude CLI sends
  it natively.)

## Recent context

- **Live cache MISS seen during #149 verification (feeds #152):** a bridged
  Fable-5 session logged `prompt-cache MISS anthropic claude-fable-5: read=0
  creation=77566 uncached_input=2 turns=19 — prefix re-billed uncached`. NOT a
  #149 side effect (the version bump / `?beta=true` / stainless headers don't key
  the cache); it's the pre-existing breakpoint-diagnosis concern (#111/#146) that
  #152 exists to probe. One mid-session miss ≠ the ~1/7 amplifier #145 fixed —
  likely a TTL lapse or breakpoint shift. Datapoint for the #152 probe, not a regression.
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
