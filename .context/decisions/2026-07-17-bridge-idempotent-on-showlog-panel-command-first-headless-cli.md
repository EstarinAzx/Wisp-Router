---
type: decision
project: wisp
updated: 2026-07-17
tags: [context, decision]
---

# Bridge idempotent-on + /show-log panel + command-first headless CLI

**Decision.** Four settled points from the 2026-07-17 TUI-plans grill:

1. **`/bridge` stops toggling.** `/bridge` = ensure-on + show the Bridge Screen (already
   running → just re-show); `/bridge off` is the only stop; Esc closes the Screen and the
   Bridge **keeps running**.
2. **`/show-log`** — a new Screen, same popup pattern as the Bridge Screen: the TUI wires its
   currently-empty `BridgeDeps.log` callback into a ~500-line ring buffer (collecting whenever
   the TUI-hosted Bridge runs, panel open or not), rendered scrollable with a scrollbar and
   auto-follow (scroll-up pauses, bottom resumes). TUI-process Bridge only — `wisp serve` is a
   separate process; its logs stay in its own terminal. Opens fine with the Bridge off.
3. **Headless commands are command-first**, following the `wisp routing` precedent:
   `wisp providers` (list ids + labels) and `wisp models <provider>` (that provider's model
   list via the existing fetch path). Rejected `wisp <provider> models`: a typo'd provider
   would fall through argv dispatch and silently open the TUI; command-first gives a clean
   "unknown provider → run `wisp providers`" error instead.
4. **wisp-slot session-awareness parked.** Hooks/statusline making a Claude Code session
   announce it runs through Wisp (caveman-style self-identification) is plugin-side and lowest
   priority — one backlog issue, not in this slice chain.

**Why.** Toggle-`/bridge` made re-opening the status panel impossible without killing the
listener; ensure-on + explicit `off` matches how every other Screen re-opens. The log seam
already exists (`BridgeDeps.log`, ~10 call sites) — the TUI just discards it today.

**Reversibility.** 1–2 easy (TUI-internal). 3 hardens once published to npm — renaming a
shipped CLI command is a breaking change, hence deciding the shape before shipping.

## Related

- [[decisions]] — index
- [[2026-07-14-both-faces-host-the-bridge-a-port-collision-fails-loud-63-pr-75]]
- [[2026-07-16-routing-cli-plus-slot-skill-not-mcp]] — the `wisp routing` command-first precedent
