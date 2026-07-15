---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Both faces host the Bridge; a port collision fails loud (#63 / PR #75)

**Decision:** the Bridge engine (`createBridgeServer`, in core) is hosted **in-process by whichever
face wants it** — the extension keeps its host (per the #66 cancellation), the TUI gains `/bridge`
(toggle + address/secret screen) and **`wisp serve`** (headless: same process, no face, no daemon,
no pids; lazy imports keep the native renderer untouched). Both faces share `config.json`
`bridge.port` and `auth.json` `bridgeSecret` (`DEFAULT_BRIDGE_PORT` moved to core so the default
can't drift), so **only one host can listen at a time — the second start fails LOUD** ("Bridge port
X is already in use — is VS Code (or another wisp) already hosting…"), exit 1 headless / status line
in the TUI. **No auto-port-hop, no takeover** — a silent second port would split clients across two
hosts with two secrets' worth of confusion. NOT a wrapper: neither face spawns the other; three
possible hosts of one library. New TUI modules: `store.ts` (shared home + OAuth managers — extracted
so serve never imports the rendering module), `bridge.ts` (deps wiring, twin of extension.ts's),
`serve.ts`. Issue #63's original "extension host removed" wording was stale pre-#66-cancellation
text; the issue was rewritten before scoping.
**Why:** the engine was already face-free in core; hosting is just wiring, and the two-faces-one-
backend shape (2026-07-14 "Panel stays") makes a host per face the natural form. Execution facts
that cost time: Bun's bind rejection carries **no `EADDRINUSE` code or substring** ("Failed to start
server. Is port … in use?") — collision detection probes the message too; `isRunning()` is false
until the bind lands, so the TUI toggle needs an **in-flight guard** or a double `/bridge` orphans
the first server's handle (cavecrew review catch, with three siblings: silent success off-palette,
secret `trim()` drift vs the extension, disk-write side effect in JSX render).
**Reversibility:** easy (additive host) — but don't add port-hop/takeover without re-reading this,
and keep the TUI's secret read trimmed like the extension's (untrimmed 401s cross-face).

## Related

- [[decisions]] — index
