---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE): cache-burn forensics → #145 + #146 filed.**

- Found the wisp quota eater: bridged sessions re-bill the WHOLE conversation
  history every ~7 requests (native: ~71) — the parse hoists mid-conversation
  `role:system` turns into the #139 volatile suffix, ahead of all messages.
  0.6–1.2M wasted write-tokens per heavy session. Decision:
  [[2026-07-21-positioned-mid-conversation-system-matters]].
- Also shipped: release.yml action bumps off Node 20 (e931080, pushed).

**Next task: #145 (preserve mid-conversation system position).**

- FIRST: verify the churn shape — capture one bridged request and confirm
  reminders arrive as `role:"system"` turns (issue lists the fix shape for
  both outcomes). Then branch → TDD → PR per ticket flow.
- #146 (guard `partial` outcome + log line) is small and independent —
  same branch or follow-up.

**Landmines:**

- `anthropicAttribution` samples the FIRST user message — #145 must not
  change what text feeds it.
- Max 4 `cache_control` markers per request; thinking blocks unmarkable —
  mark() slide in anthropic.ts handles both; positioned system turns must
  stay markable text blocks or anchor null cleanly.
- #139's top-level stable/volatile split is CORRECT — #145 only moves
  mid-conversation turns, don't touch the systemSplit layer.
- `usage.iterations` last entry must stay the final base pass.

## Related

- [[active-work]]
- [[overview]]
