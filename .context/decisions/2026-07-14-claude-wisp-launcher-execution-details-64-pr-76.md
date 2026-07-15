---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# claude-wisp launcher execution details (#64 / PR #76)

**Decision:** the launcher's Bridge probe sends **no secret** (any HTTP response — even 401 —
proves the listener; a squatter on the port must never see the key), and its store reads are
**read-only** — a missing `bridgeSecret` means no Bridge ever ran from this `~/.wisp`, and writing
one would mask that signal. Windows spawn prefers a PATH-scanned `claude.exe` (direct, fully
verbatim argv); only npm `.cmd`/`.bat` shims go through `cmd.exe /d /s /c` with hand quoting
(metachar-triggered, doubled inner quotes + doubled trailing backslashes) because node/Bun refuse
`.cmd` without a shell (BatBadBut). Env assembly is core's pure `buildClaudeLaunch`, deliberately
beside `buildClaudeCodeSnippets` — one file owns the env trio.
**Why:** review findings + the launch contract had to be unit-testable; the quoting ceiling
(`%VAR%` expands even inside cmd quotes) is accepted and documented in-code — native installs
bypass the shim entirely.
**Reversibility:** easy (swap in cross-spawn-style escaping if the shim path ever bites); the
secretless-probe and read-only-secret postures are security calls — treat as one-way.

## Related

- [[decisions]] — index
