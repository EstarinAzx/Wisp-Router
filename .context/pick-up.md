---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Planned the Grok (xAI OAuth) provider and filed it as a self-promoting ticket chain — no code shipped.**
- Ran the `init` funnel: studied `github.com/BlockedPath/pi-xai-oauth` (reference — extract the xAI OAuth
  flow + payload rules only), locked decisions **D1–D7**, mapped ~60+ touch points.
- Filed **epic #91** + slices **#92–#98** on `EstarinAzx/Wisp-Router`, dependency-ordered. Every slice
  carries a "Loop protocol" footer (read blockers' breadcrumbs + committed code first; breadcrumb on
  finish; promote unblocked dependents to `ready-for-agent`). Recorded in [[decisions]] (2026-07-15 "Grok
  provider planned"). Target release **2.0.5**.

## Next task
**Run the Grok provider loop — self-paced, no fixed interval:**

```
/loop /preset ticket-loop
```

- Epic **#91**; **#92** (catalog foundation) is the only `ready-for-agent` ticket — the trunk. No code
  dependencies: pure `catalog.ts` + `home.ts` + a new `xai.test.ts`.
- The chain **self-promotes**: closing #92 labels #93 + #94 ready-for-agent, on down to #98 (release). One
  loop walks the whole tree.
- 7 tickets is long → wrap in `/relay N=6 /preset ticket-loop` for fresh sessions (relay = session
  hygiene, not pacing). Do **not** set a fixed wall-clock interval — see [[prefers-dynamic-loop-pacing]];
  ticket work advances on leg-finish, not a timer.

## Landmines
- **Grok ≠ Groq.** New provider is `id:'xai'` (Grok, xAI, OAuth). Do NOT touch the existing `id:'groq'`
  row (Llama, API-key).
- The client is a **Codex-twin** (Responses API + `x-grok-*` headers + subscription proxy), NOT the plain
  OpenAI-chat path — reference #94 against `codexClient.ts`.
- xAI public constants (client id, scope, endpoints, model caps) live in the **epic #91 body** — copy from
  there, don't re-derive.
- **Deferred (carried, not blocking the loop):** 2.0.4 live-terminal checks — #87 residual live-confirm +
  eyeball the fixed `/bridge` screen (see [[active-work]]); npm token rotation (`NPM_TOKEN`); Codex signed
  out (`/signin codex` before Codex checks).

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]
