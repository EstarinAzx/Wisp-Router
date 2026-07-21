---
type: active-work
project: wisp
updated: 2026-07-21
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-21 by Fable 5 (wrap-up)._
_At commit: 5b87e8f (v2.0.30 release — #156 cache diagnostics on main)._

## Current focus

**#156 DONE + CLOSED + released (v2.0.30). The whole #148 umbrella arc is CLOSED.**
Server-side cache diagnostics adopted on the Anthropic OAuth path: every request
rides `cache-diagnosis-2026-04-07` + `diagnostics.previous_message_id` (chained
per conversation), the Bridge logs the server's authoritative `cache_miss_reason`
in the MISS line, heuristic kept as fallback. Merged via PR #157 (631 tests, 5
new). **The `ready-for-agent` queue is EMPTY; no umbrella open.**

## State

- **In flight:** nothing — the v2.0.30 release workflow completed GREEN before
  wrap-up finished (2m10s, binaries + npm shell published).
- **Queue:** empty. **#148 closed** (all four children #149/#150/#151/#152 done).
  **#152 closed** — probe (breadcrumb comment on the issue) proved the OAuth
  backend honors the diagnosis beta; adoption shipped as #156/PR #157. **#69**
  backlog remains the only open thread.
- **Done this session:** #152 probe (3 scratchpad scripts: control, forced-miss,
  streaming — full captures preserved as comments on #152), #156 implementation
  (`selectAnthropicBetas` +1 token, `buildAnthropicMessagesBody` diagnostics
  field, `anthropicDiagnosis` extractor, `createAnthropicDiagnosisChain`,
  Bridge wiring + log preference), v2.0.30 release commit + tag.
- **Blocked:** nothing.

## Pick up here

No task queued. Ask the user what's next: #69 backlog, a new spec, or a
vscode-face release (extension changelog does NOT yet mention #156; only the
TUI changelog does).

## Skills for next session

- `/preset pick-up` — note points here.
- `packages/tui:verify` — sandboxed CLI verification for TUI command-surface changes.

## Open questions

- None for the wisp codebase.

## Recent context

- **Diagnosis beta contract (probe-verified, #152):** header token + body
  `diagnostics: {previous_message_id}` BOTH required; response carries
  `message_start.message.diagnostics` — `null` healthy, `{cache_miss_reason:
  {type, cache_missed_input_tokens}}` on a diagnosed break. Key absent entirely
  without the beta. First-party-only per public docs but the OAuth subscription
  backend honors it.
- **Live-check technique (still the cheap path):** scratchpad bun script
  importing core src with stored `~/.wisp/auth.json` creds. Caution from this
  session: haiku's min cacheable prefix is 4096 tokens — pad filler well past it
  or creation reads 0 and the check looks broken when it isn't.
- Landmines (still true): `selectAnthropicBetas` gates are EXCLUSION lists —
  don't invert to allowlists; the diagnosis token is deliberately LAST (trailing
  position probe-validated). Refresh/sign-out must keep creds identity fields.
  Max 4 `cache_control` markers; builder hoists at most ONE leading system
  message. Keep `cc_entrypoint=cli` + UA `(external, cli)`; fingerprint hash
  UNVALIDATED. Wisp cache health: ~1/392 misses post-#145 — better than native
  (~1/70).

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[2026-07-21-server-cache-diagnosis-adopted]]
- [[2026-07-21-beta-selection-model-gated-exclusion]]
