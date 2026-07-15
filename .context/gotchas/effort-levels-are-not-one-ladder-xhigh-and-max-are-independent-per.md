---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Effort levels are NOT one ladder — `xhigh` and `max` are independent per-model capabilities

`low|medium|high|xhigh|max` reads like one ascending scale, but `xhigh` and `max` are distinct features with
**different** model sets: `max` = Opus 4.6/4.7/4.8, `xhigh` = Opus 4.7/4.8 (+ OpenAI/Codex). **Opus 4.6 takes
`max` but rejects `xhigh`** — do not assume `max ⊃ xhigh`. Sonnet 4.6 / Opus 4.5 take neither (ceiling =
`high`). The panel offers the full ladder to every effort-capable Claude (mirrors the first-party `/effort`
slider) and `anthropicThinkingEffort` clamps the wire to each model's ceiling — so a level shown in the picker
may silently degrade (e.g. Sonnet `max` → `high`). That is intended, not a bug. Source of truth: openclaude
`src/utils/effort.ts` (`modelSupportsMaxEffort`, `modelSupportsXHighEffort`). See [[decisions]] 2026-06-23.

## Related

- [[gotchas]] — index
