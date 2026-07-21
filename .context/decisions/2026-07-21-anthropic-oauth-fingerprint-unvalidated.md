---
type: decision
project: wisp
date: 2026-07-21
tags: [context, decision, anthropic, oauth, fingerprint]
---

# Anthropic-OAuth cc_version fingerprint is unvalidated; wire-parity backlog filed (#148–#152)

**Context.** Compared wisp's Anthropic-OAuth (Claude.ai subscription) request against
[diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) and against a live
capture of the real `claude-cli` **2.1.216** (point `ANTHROPIC_BASE_URL` at a local
listener, run `claude -p`, dump the request with the bearer redacted).

**Settled question — is the `cc_version` billing fingerprint validated? NO.**
Real claude sent `cc_version=2.1.216.c5e`. Wisp's own recipe
(`sha256(salt + firstUserMsg[4,7,20] + version)[:3]`) on the *same* first-user-message +
version yields `2b0` — a different hash — and wisp is accepted in production regardless.
If the backend recomputed and validated, wisp (with a non-matching recipe, and version
`0.19.0`) would be rejected. It isn't. So:
- **Bumping `CLAUDE_CODE_VERSION` is zero-risk** — nothing recomputes the hash.
- Wisp's salt/index fingerprint math is harmless theater; do **not** chase the real algorithm.
- This overturns the `anthropicClient.ts` comment "the backend recomputes + validates"
  and confirms OmniRoute's "does not appear to validate."

**What wisp gets right (verified on the wire, keep as-is):** `cc_version` as a `system[0]`
text block + its format; `cc_entrypoint=cli` and UA `(external, cli)` (the `-p` capture
shows `sdk-cli` only because that path uses the SDK entrypoint — the interactive bridge is
`cli`); `anthropic-version: 2023-06-01`; `x-app: cli`; 1h `cache_control` markers.

**Gaps → backlog.** Version `0.19.0` vs `2.1.216`; no `x-stainless-*` headers (real sends 8);
no `x-claude-code-session-id`; no `metadata.user_id` blob; `anthropic-beta` 4 vs real 12.
Ranking: local `2.1.216` > OmniRoute `2.1.207` > wisp `0.19.0`; OmniRoute mirrors the real
wire, wisp is the outlier. Filed as umbrella **#148** + children **#149** (fingerprint
parity, ready-for-agent), **#150** (bootstrap account identity + metadata, ready-for-agent),
**#151** (shape-aware anthropic-beta, ready-for-agent), **#152** (cache-diagnosis probe,
ready-for-human).

**Not a cache issue.** Fallback rate is already ~1/392 (better than ~1/70 native), so every
cache-facing item (incl. `extended-cache-ttl`) is fingerprint parity, not a cache fix —
wisp's 1h TTL demonstrably works without the beta flag.

## Related

- [[oauth-recon]]
- [[2026-07-21-positioned-mid-conversation-system-matters]]
