---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE): #145 + #146 shipped as v2.0.29, installed.**

- Cache amplifier verified by live wire capture (reminders ARE positioned
  `role:"system"` turns; OAuth wire takes the mid-conversation-system beta),
  fixed, review-hardened (4 pre-merge regression catches), merged (PR #147),
  released, and the dev machine's global `wisp-router` is on 2.0.29.

**Next task: none queued — pick from candidates in `active-work.md`.**

- Best first move: 5-min transcript forensics after the user's next heavy
  bridged session — fallback rate should be ~native (~1/70, was ~1/7);
  serve-log `PARTIAL` lines should be rare singletons, never bursts.
- Otherwise: offer to close #126 (shipped spec umbrella), or the user-side
  session-start token prune (`/preset health` route, not a wisp change).

**Landmines:**

- Builder hoists at most ONE leading system message — a second leading one
  stays positioned (hoisting it re-creates the amplifier). Don't "simplify"
  the `lead` logic in `buildAnthropicMessagesBody`.
- `anthropicAttribution` samples the first USER turn (`convo.find`), not
  `convo[0]` — server-validated fingerprint, do not touch.
- Max 4 `cache_control` markers; thinking blocks unmarkable; positioned
  system turns are markable single-text-block messages.
- `usage.iterations` last entry must stay the final base pass.

## Related

- [[active-work]]
- [[overview]]
