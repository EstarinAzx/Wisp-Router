---
type: decision
project: wisp
date: 2026-07-21
tags: [context, decision]
---

# Advisor usage surfaces as openclaude-style usage.iterations (#143)

**Decision.** The Anthropic door reports advisor reviewer cost via
`usage.iterations` on the closing usage frame (streaming `message_delta` +
non-streaming reply): one `advisor_message` entry per reviewer sub-call
(**resolved** Target model + the four token fields) in consult order, then the
**final base pass as the last entry** (`type:'message'`). Minimal array — no
intermediate base passes (nothing parses them). Emission is gated both ways:
no advisor entries → no `iterations` key (plain turns byte-identical to
pre-#143); no base usage → no `iterations` at all. Reviewer usage rides a new
`advisor_usage` stream event, never the `usage` channel.

**Why.**
- openclaude reads exactly two things: entries with `type === 'advisor_message'`
  (`getAdvisorUsage` → `/cost` + session totals) and `iterations[-1]` as the
  **authoritative final context window** (`tokens.ts
  finalContextTokensFromLastResponse`, task_budget countdown). The last slot
  must therefore be the base pass — an advisor entry sitting last hijacks
  window math. Everything else is dead weight.
- Honest model id (the resolved Target, not the `claude-*` name the picker
  sent): routing rebinds stay visible; unknown ids take Claude Code's default
  price + unknown-model flag, which beats a fictional Claude-table price.
- Omission over zeros: a reviewer Target that reports no usage produces no
  entry — zeros would render "advisor was free" with confident formatting.
- Top-level usage stays the base pass alone, so `anthropicCacheOutcome`
  (#111 guard) is untouched by design, not by luck.
- Live-verified 2026-07-21 (headless serve + `claude-wisp -p` forcing one
  consult): Claude Code accepted the frames and folded advisor tokens into
  `modelUsage` + `total_cost_usd`.

**Reversibility.** Additive wire field — removing it just returns `/cost` to
under-reporting. The `string | ReviewerVerdict` reviewer union and
`startProviderStream`'s returned `model` are internal seams, cheap to change.

## Related

- [[decisions]]
- [[2026-07-20-system-split-at-client-marker]]
- [[2026-07-19-wisp-native-advisor-via-door-server-tool]]
