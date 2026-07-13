---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: 8d6be05 on `feat/routing-map-family-routes` (#51 + vision bugfix committed, NOT yet pushed/PR'd)._

## Current focus
**Ship the branch.** It now carries #51 (Routing map slice 1, `f9c0519`) PLUS a live-verified Anthropic-door
vision bugfix (`ab21c18`, `8d6be05`). All demo-verified; `/preset ship` is the next mechanical step, then #52.

## State
- **Done this session (vision bugfix, commits ab21c18 + 8d6be05):**
  - **Bug 1 — inline attach dead on the Anthropic provider path only:** `startProviderStream` in
    `bridgeServer.ts` forwarded `images` on the Codex + keyed paths but omitted them on the Anthropic
    path. One-word fix (`images: t.images`). Codex/keyed inline attach was never broken.
  - **Bug 2 — Read-on-image dead on ALL door paths:** `splitUserBlocks` in `bridgeAnthropic.ts`
    flattened `tool_result` content to text, dropping the image block Claude Code's Read tool returns.
    Fix: hoist tool_result images into the turn's `images[]` (normalized shape has no per-result slot).
    TDD'd (`bridgeAnthropic.test.ts` hoist test). Suite 297/297.
  - **Observable added:** the door's per-request log line now ends `images=N` — 0 means the client never
    sent pixels, >0 means any blindness is downstream of the door.
  - **Live-verified by user:** Anthropic-bound model reads inline attach; codex path proven clean
    (`images=1` on the attach turn, `images=2` after Read). GPT calling Read despite inline pixels is
    model habit, NOT a Wisp bug — the source-path text Claude Code sends with every attach baits it.
- **Done earlier on this branch (#51, commit f9c0519):** pure resolver `src/routing.ts` (id → alias →
  family → active) + 14-test decision table; both doors route via `routeFor` with pinned-model override;
  map in globalState `wisp.routingMap`; panel Family rows.
- **In flight:** branch committed locally, not pushed.
- **Blocked:** nothing.

## Pick up here
1. **`/preset ship`** — push the branch, open the PR (covers #51 + the vision fix), merge.
2. **#52 Aliases + models list** — panel add/remove Alias rows (name + Target; panel must refuse an
   Alias shadowing a Provider id) + advertise aliases in both doors' `GET /v1/models`. Resolver needs
   NO changes — alias lookup already built + tested in `routing.ts`.
3. Then #53 (per-row model dropdowns), then **TUI PRD for Wisp** via `/preset init` (user-stated order).

## Skills for next session
- /preset pick-up — resume from the note.
- /preset ship — if the PR still isn't open.

## Open questions
- None new. Still deferred by design: forced `tool_choice` + `temperature` not threaded; OpenAI-door
  Codex strict-tools limit. (The old "agent-mode vision flake" open question is likely EXPLAINED by
  bug 1/2 above — retest before reopening it.)

## Recent context
- Vision seam now: inline attach → `splitUserBlocks` images; Read-on-image → tool_result hoist into the
  same `images[]`; all three `startProviderStream` paths forward them; send-builders emit
  `image` (Anthropic) / `input_image` (Codex) / `image_url` (keyed) blocks.
- Debugging a "model can't see image" report: check the Wisp output channel `images=N` first — see
  [[gotchas]] (2026-07-14 entry).
- #52's models-list surface: OpenAI door `buildModelsList`, Anthropic door `buildAnthropicModelsList`
  (`bridgeAnthropic.ts`) — aliases must appear in both; Claude Code's own /model picker can't list
  them (hardcoded), users type `/model <alias>`.
- Panel model lists still Active-Provider-only — per-row dropdowns deliberately deferred to #53;
  don't pull that plumbing into #52.

## Related
- [[overview]]
- [[api]] — Bridge doors + Routing map (live, documented)
- [[decisions]] — 2026-07-13 Routing-map entry · 2026-07-14 tool_result-image-hoist entry
- [[gotchas]] — stale-build + dup-panel traps · images=N vision-debug entry
- [[happy-path]] — "Bridge Routing map" MVD
