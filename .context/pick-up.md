---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE + CLOSED): #149 — Tier-1 fingerprint parity.**

- Merged to `main` via #153 (merge `eece31d`). 605 tests green, compile clean.
  All changes in `packages/core/src/anthropicClient.ts` + tests.
- Shipped: `CLAUDE_CODE_VERSION` 0.19.0 → 2.1.216 (feeds UA + `cc_version` block),
  8 `x-stainless-*` headers, per-process `x-claude-code-session-id`,
  `anthropic-dangerous-direct-browser-access`, POST `/v1/messages?beta=true`.
- **Live-verified + closed:** dev build (`bun src/index.tsx serve`) served a real
  bridged Fable-5 session via the Anthropic OAuth path — `hello`→reply, tokens
  flowing, no 429. Fingerprint accepted by the live backend. Optional byte-exact
  header-diff harness (listener + temp base redirect) was written + smoke-tested
  but is unused — see scratchpad `capture-149.mjs` if a literal wire match is ever
  wanted.

**Next task: #150 — bootstrap account identity + `metadata.user_id` (`ready-for-agent`).**

- Needs the bootstrap fetch (part 1) first to get `account_uuid`.
- `metadata.user_id.session_id` MUST equal the `x-claude-code-session-id` header
  #149 added — reuse the `CLAUDE_CODE_SESSION_ID` const in `anthropicClient.ts`.
- Then #151 (beta widen 4→12), #152 (probe cache-diagnosis first, `ready-for-human`).

**Landmines:**

- **Session-id scope decision (#150):** `CLAUDE_CODE_SESSION_ID` is minted once per
  PROCESS (module-load `randomUUID()`), not per conversation. One `wisp serve` can
  serve many Claude Code conversations that would then share one id — unlike real
  claude, which mints a fresh one per invocation. #150 threads this into
  `metadata.user_id.session_id`; decide there if per-process is acceptable or it
  must become per-conversation.
- Keep `cc_entrypoint=cli` + UA suffix `(external, cli)` (do NOT switch to `sdk-cli`).
- Fingerprint hash is UNVALIDATED — don't reproduce claude's real algorithm.
- Verify every wire change with the `ANTHROPIC_BASE_URL` capture harness against an
  interactive bridged session (not `-p`).
- **Repo hazard this session:** a concurrent process repeatedly checked out `main`
  mid-work. Commits were safe on the branch; if the working tree looks reverted,
  `git checkout 149-fingerprint-parity` restores it. Confirm branch before any git write.
- Prior #145 landmines still hold (see [[active-work]] Recent context).

## Related

- [[active-work]]
- [[overview]]
- [[decisions/2026-07-21-anthropic-oauth-fingerprint-unvalidated]]
