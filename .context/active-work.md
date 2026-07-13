---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: f634a35 on `feat/routing-map-aliases` (#52 done + demo-verified; branch stacked on the
still-unpushed `feat/routing-map-family-routes`)._

## Current focus
**Ship BOTH branches.** Two local, unpushed branches now stack: `feat/routing-map-family-routes`
(#51 Routing map slice 1 + the vision bugfix, through `80e746e`) and `feat/routing-map-aliases` on top
(#52, `02e8bde`..`f634a35`). Ship order: PR + merge the family branch first, then the aliases branch.
Then #53.

## State
- **Done this session (#52 Aliases + models-list advertising, demo-verified by user):**
  - Panel Alias rows (`webview/app.tsx`): saved rows read-only + ✕ remove; draft add-row (name +
    Provider dropdown + free-text model). Name colliding with a Provider id → Add disabled + visible
    red message (webview check; `setAlias` in `extension.ts` re-guards as the trust boundary, upsert
    by exact name).
  - Both doors' `GET /v1/models` advertise alias names after the Provider ids, read live per request —
    raw on the OpenAI door, `claude-wisp-` prefixed on the Anthropic door so a picked entry
    round-trips through the inbound strip to the alias route. Family routes never listed.
  - Alias picker rows carry the pinned model (`sol — gpt-5.6-terra`), toggleable via
    `wisp.bridge.aliasPickerShowsModel` (new setting, default on) — settable from Settings **or** the
    panel checkbox under the alias rows. Claude Code refetches the list only on restart.
  - Resolver untouched — alias lookup shipped + tested in #51. Suite 300/300, compile clean.
- **Done earlier on the stack:** #51 resolver + Family rows + both-door routing (`f9c0519`); Anthropic-door
  vision bugfix (`ab21c18`, `8d6be05`).
- **In flight:** both branches local, nothing pushed.
- **Blocked:** nothing.

## Pick up here
1. **`/preset ship`** ×2 — push + PR + merge `feat/routing-map-family-routes` (covers #51 + vision fix),
   then `feat/routing-map-aliases` (covers #52).
2. **#53 per-row model dropdowns** — panel Routing-map rows get live model lists instead of free-text
   (the plumbing deliberately kept OUT of #52).
3. Then **TUI PRD for Wisp** via `/preset init` (user-stated order).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset ship — twice, family branch first.

## Open questions
- None new. Still deferred by design: forced `tool_choice` + `temperature` not threaded on the OpenAI
  door; OpenAI-door Codex strict-tools limit.

## Recent context
- Alias UI state split: saved rows live in host-pushed `state.routingAliases`; only the draft add-row is
  webview-local (`aliasDraft`). The checkbox uses an optimistic echo confirmed by the config listener's
  state push.
- `buildModelsList(infos, aliasNames?)` / `buildAnthropicModelsList(infos, aliases?)` — second param
  optional, alias display_name renders bare when no model passed (that's how the toggle threads through:
  `bridgeServer.ts` passes `model: undefined` when the setting is off).
- Panel model lists still Active-Provider-only — that's exactly #53's job.

## Related
- [[overview]]
- [[api]] — Bridge doors + Routing map + alias advertising (updated this session)
- [[decisions]] — 2026-07-13 Routing-map entry (covers the alias/advertising design)
- [[gotchas]] — stale-build + dup-panel traps · images=N vision-debug entry
- [[happy-path]] — "Bridge Routing map" MVD
