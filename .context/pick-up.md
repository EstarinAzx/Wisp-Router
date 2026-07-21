---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE): OmniRoute comparison + live `claude-cli 2.1.216` capture → wire-parity backlog filed (#148–#152).**

- Compared wisp's Anthropic-OAuth path against diegosouzapw/OmniRoute and a live
  capture of real `claude-cli 2.1.216` (`ANTHROPIC_BASE_URL` listener + `claude -p`).
- Settled fact: the `cc_version` billing fingerprint is **not validated** (real hash
  `2.1.216.c5e` vs wisp's own recipe `2b0`, accepted anyway) → version bump is
  zero-risk. Decision: [[decisions/2026-07-21-anthropic-oauth-fingerprint-unvalidated]].
- Filed umbrella #148 + children #149 (fingerprint parity), #150 (account identity),
  #151 (anthropic-beta widen), #152 (cache-diagnosis probe).
- v2.0.29 also verified live this session (fallback ~1/392; posted on #145).

**Next task: #149 — Tier-1 fingerprint parity (`ready-for-agent`).**

- One self-contained PR: bump `CLAUDE_CODE_VERSION` 0.19.0 → 2.1.216
  (`packages/core/src/anthropicClient.ts:66`, feeds both UA + cc_version), and emit
  the 8 `x-stainless-*` headers + `x-claude-code-session-id` +
  `anthropic-dangerous-direct-browser-access` in `anthropicMessagesHeaders`
  (`anthropicClient.ts:71`). Then #150 → #151 → #152.

**Landmines:**

- **Keep `cc_entrypoint=cli` and UA suffix `(external, cli)`.** The `-p` capture shows
  `sdk-cli` ONLY because `-p` uses the SDK entrypoint; the interactive bridge is `cli`.
  Do NOT switch to `sdk-cli`.
- Fingerprint hash is unvalidated — do NOT try to reproduce claude's real algorithm;
  wisp's salt/index math is harmless theater, leave it.
- #150's `metadata.user_id.account_uuid` needs the bootstrap fetch (part 1) first;
  `session_id` must equal the `x-claude-code-session-id` header from #149.
- Verify every change with the `ANTHROPIC_BASE_URL` capture harness (re-run against an
  interactive bridged session for the exact `cli`-entrypoint UA).
- Prior #145 landmines still hold (see [[active-work]] Recent context).

## Related

- [[active-work]]
- [[overview]]
- [[decisions/2026-07-21-anthropic-oauth-fingerprint-unvalidated]]
