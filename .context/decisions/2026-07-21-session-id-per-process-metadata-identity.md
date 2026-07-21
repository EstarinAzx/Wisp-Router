---
type: decision
project: wisp
date: 2026-07-21
tags: [context, decision, anthropic, oauth, identity]
---

# metadata.user_id session_id stays per-process; identity lives on the creds bundle (#150)

**Context.** #150 added the `metadata.user_id` blob
(`{device_id, account_uuid, session_id}`) to every Anthropic-OAuth Messages request, plus
the bootstrap account fetch. Two design questions were open.

**Settled — session_id scope: per-PROCESS, not per-conversation.** The #149 landmine asked
whether the module-load `CLAUDE_CODE_SESSION_ID` (one UUID per `wisp serve` process, shared
by every conversation it bridges) is acceptable, since real claude mints one per CLI
invocation. Decision: yes — one long-lived process sharing an id looks like one long claude
session; the live backend accepted it (post-merge haiku turn, no 429). Per-conversation
parity would require threading the inbound `x-claude-code-session-id` header through
door → bridge → client; that plumbing is deliberately NOT built. Upgrade path noted in a
`ponytail:` comment at the `CLAUDE_CODE_SESSION_ID` const in `anthropicClient.ts` — revisit
only if the shared id ever draws server-side attention.

**Settled — identity rides ON `AnthropicCreds`, not a separate store.** deviceId +
bootstrap fields (accountUuid/email/org/tier) live in the anthropic slice of
`~/.wisp/auth.json`, so the client gets them for free through the existing `creds` arg —
zero new plumbing. Consequences that must hold:
- a token **refresh** rebuilds creds from the token payload → it must carry the non-token
  fields over (destructure-rest in `refreshIfNeeded`);
- **sign-out** tombstones the tokens but keeps `deviceId` (it identifies the install, not
  the sign-in);
- pre-#150 creds (signed in before, never re-signed) degrade to a per-process fallback
  device id + an account uuid derived from it (sha256 → uuid shape, OmniRoute's fallback) —
  metadata is never absent.

**Reversibility.** Session-id scope: cheap to revisit (the pure `anthropicUserId` takes
sessionId as an arg; only the plumbing is missing). Identity-on-creds: entrenched in the
auth.json schema — moving it later means a migration.

## Related

- [[2026-07-21-anthropic-oauth-fingerprint-unvalidated]]
- [[oauth-recon]]
