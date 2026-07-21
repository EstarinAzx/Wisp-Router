---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE, PR open): #149 — Tier-1 fingerprint parity.**

- Branch `149-fingerprint-parity` (`63276bf`, off main), PR open. 605 tests green,
  compile clean. All changes in `packages/core/src/anthropicClient.ts` + tests.
- Shipped: `CLAUDE_CODE_VERSION` 0.19.0 → 2.1.216 (feeds UA + `cc_version` block),
  8 `x-stainless-*` headers, per-process `x-claude-code-session-id`,
  `anthropic-dangerous-direct-browser-access`, POST `/v1/messages?beta=true`.
- **#149 stays OPEN** — acceptance is a live `ANTHROPIC_BASE_URL` re-capture vs real
  2.1.216 (interactive bridged session, NOT `-p`), diffing all outbound headers.
  Unit-green is not wire-verified. Breadcrumb posted on the issue.

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
