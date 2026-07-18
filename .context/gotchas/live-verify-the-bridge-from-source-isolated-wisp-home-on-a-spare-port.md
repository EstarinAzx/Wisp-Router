---
type: gotcha
project: wisp
updated: 2026-07-18
tags: [context, gotchas]
---

# Live-verify bridge changes from source: isolated `WISP_HOME` on a spare port

To test working-tree bridge changes end-to-end you must NOT reuse the running
install: the installed bridge listens on **41184**, and your own Claude Code
session (if wisped) depends on it — killing it kills your lifeline, and it also
orphans the bun process on a backgrounded-wrapper kill. Instead run the
from-source bridge under an isolated home on a spare port:

1. Copy `~/.wisp/{auth.json,config.json}` to a temp dir; patch the copied
   config's `bridge.port` to a free port (e.g. 41185).
2. Launch `WISP_HOME=<tmpdir> bun packages/tui/src/index.tsx serve` (backgrounded).
   Wait for `[bridge] listening on 127.0.0.1:41185`.
3. Hit the door with `x-api-key` = the **top-level** `bridgeSecret` in
   `auth.json` — NOT `.anthropic.bridgeSecret` (that path is wrong → `401 invalid
   or missing access secret`). `ensureBridgeSecret` reads `readAuth().bridgeSecret`.
4. Kill by the PID of the spare-port listener (`netstat -ano | grep 41185`);
   never touch 41184. Remove the temp home after.

The live meter proof: two identical streaming calls with a ≥1024-token prefix →
`message_start`/`message_delta` usage show real numbers, `cache_read` non-zero on
the warm (second) call. Cross-checked against [[2026-07-18-real-usage-meter-forward-not-synthesize]].

## Related

- [[gotchas]] — index
- [[2026-07-18-real-usage-meter-forward-not-synthesize]]
