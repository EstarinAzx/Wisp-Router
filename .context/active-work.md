---
type: active-work
project: wisp
updated: 2026-07-16
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-16 by Fable 5 (auto)._
_At commit: `6812751` on `main` (in sync with `origin/main`; tag `v2.0.10` pushed)._

## Current focus
**wisp-router 2.0.10 released and VERIFIED** — the #111 prompt-caching fix. Bridged
Anthropic-routed sessions were burning plan usage ~5-10x native because the Bridge dropped
`cache_control`; `buildAnthropicMessagesBody` now places two ephemeral breakpoints (last
system block — covers tools too — and the final message's last block). Live-verified against
the Claude.ai OAuth endpoint: turn 1 wrote 9122 tokens to cache, turn 2 read all 9122 back.
npm thin shell + all 4 platform packages + release assets confirmed at 2.0.10.

## State
- **#111 cache fix DONE** (`e5ec476`, closed): two breakpoints in core `anthropic.ts`; a
  bare-string final turn converts to one text block to carry the marker; all earlier plain
  turns keep the #29 bare-string shape. 3 new + 11 updated test assertions; suite 437/437;
  extension + TUI tsc clean. See [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]].
- **Routing CLI + Slot skill planned** — spec #107, tickets #108 → #109 → #110 (blocking
  chain), all `ready-for-agent`. Design settled by grill; see
  [[2026-07-16-routing-cli-plus-slot-skill-not-mcp]]. **Slot** is now a CONTEXT.md term;
  MVD spine in [[happy-path]] § "Routing CLI + Slot skill".
- Release bump `6812751`, workflow run 29489189308 green.

## In flight
None.

## Blocked
None.

## Pick up here
Frontier: **#108 — `wisp routing` show + `--json` snapshot** (unblocked). Then #109
(set/unset + credential warning), then #110 (Slot skill, lands in `~/.claude/skills/`).
Carried backlog behind those:
1. **Publish VS Code extension 1.7.0 to the Marketplace** — human step: `vsce publish` in
   `packages/vscode` (EsarinAzx PAT) or upload `packages/vscode/wisp-1.7.0.vsix`.
   **Never tag `v1.7.0`** (fires the TUI `release.yml`).
2. Panel-side alias rename — TUI-only follow-up.
3. Root `.vsix` pile — stale builds; **ask before purging**.
4. catalog.ts someday-9 remainder — deferred, low payoff.

## Open questions
- (carried) grok-4.5 on public `api.x.ai`: SuperGrok vs metered billing unverified.
- (carried) Bridge client-tag heuristic mislabels some Claude Code requests as `(panel)`.

## Recent context
- User's installed wrapper: `npm i -g wisp-router@2.0.10` then restart the Bridge host —
  earlier binaries still burn uncached on Anthropic-routed sessions.
- Until the user's Max window resets: rebind the haiku Family route off `anthropic` (else
  Claude Code background chores keep billing Max even when the session model is a Codex
  alias); see [[bridged-family-routes-bound-to-anthropic-burn-max-quota]].

## Related
- [[overview]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[pick-up]]
- [[happy-path]]
