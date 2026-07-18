---
type: gotcha
project: wisp
updated: 2026-07-18
tags: [context, gotchas]
---

# Codex 502 "input exceeds the context window" is the provider's limit, not a bridge bug

`502 provider request failed: Error: Your input exceeds the context window…` on a codex-routed turn is a
**passthrough** — `bridgeServer.ts` catches whatever the provider throws and relays it verbatim
(`sendError(res, 502, ...)`). The bridge forwards the whole conversation **untrimmed**; there is no
fit-to-window step. So the codex backend rejects on *its own* window while opus turns in the same session
sail through. Windows (`codex.ts:182-187`): gpt-5.x Codex = 400K input, o-series = 200K — both far under
Opus 4.8 [1m]. Claude Code only auto-compacts near *its* 1M, so a conversation can be comfy for opus yet
overflow codex. That's the "sometimes": it tracks conversation size + which turns went to codex.

**Two accelerants:** pasted images cost a lot of codex tokens; and the ChatGPT-subscription (OAuth) Codex
path can enforce a *tighter* per-request cap than the 400K API sticker, so you can 502 well before 400K.

**Fix is operational, not code:** `/compact` (or `/clear`) before switching to a codex model; keep images
off codex turns when the convo is already big; or run codex work in a fresh `/slot` subagent (clean
context). Bridge-side pre-trim is a floating plan (see `active-work.md` Open questions) — lossy, needs a
drop policy, build only if the 502s get frequent.

## Related

- [[gotchas]] — index
- [[active-work]] — floating pre-trim plan
