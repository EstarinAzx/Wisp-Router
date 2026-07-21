---
type: decision
project: wisp
updated: 2026-07-21
tags: [context, decision]
---

# Server cache diagnosis adopted — authoritative for MISS, heuristic retained

## Decision

Adopt `cache-diagnosis-2026-04-07` on the Anthropic OAuth path (#156, from the
#152 probe): every request carries the beta token + `diagnostics.
previous_message_id`, chained per conversation by `createAnthropicDiagnosisChain`
— keyed by **model + first user turn's text** (stable for a conversation's life),
capped FIFO with recency refresh. The Bridge's prompt-cache MISS line prefers the
server's `cache_miss_reason`; `anthropicCacheOutcome` stays as fallback and a
null server diagnosis does NOT silence it.

## Why

- Probe (#152, breadcrumbed on the issue) proved the subscription backend honors
  the beta despite "first-party-only" docs: `diagnostics` key is beta-gated,
  `null` on healthy turns, `{cache_miss_reason: {type, cache_missed_input_tokens}}`
  on a diagnosed break — reason + magnitude, no inference.
- Heuristic retained because the server reports nothing for the #145
  PARTIAL shape (history re-bill behind a stable prefix) and null also means
  "no compare target" (first turn, evicted chain entry) — so null is not proof
  of health.
- Conversation fingerprint = first user turn, not the inbound session-id header:
  one Claude session interleaves main/subagent/utility conversations that must
  chain separately; identical repeated one-shot utility turns sharing a key is
  acceptable (same-shaped requests should hit the same cache).
- Inbound `diagnostics` passthrough from the wisped client deliberately NOT
  built — same call as [[2026-07-21-beta-selection-model-gated-exclusion]]'s
  beta passthrough: the door normalizes traffic to wisp turns and the door's
  synthesized message ids are not the backend's.
- Diagnosis token rides LAST in the beta header — appended after the 2.1.216
  capture set; the trailing position is the probe-validated one.

## Reversibility

Cheap. Remove the token from `selectAnthropicBetas`, the `diagnostics` body
field, and the chain wiring; the heuristic path is untouched underneath. The
log-preference branch degrades to today's behavior the moment the server stops
answering (missReason absent → heuristic line).

## Related

- [[decisions]]
- [[2026-07-21-beta-selection-model-gated-exclusion]]
- [[active-work]]
