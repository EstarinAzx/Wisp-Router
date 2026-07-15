---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Wisp home store execution details (#59 / PR #71)

**Decision:** `~/.wisp/` is two files — `config.json` (provider/models/effort/routing/customBaseUrl/
bridge) + owner-only `auth.json` (keys map keyed by `keyId`, codex/anthropic bundles, bridgeSecret) —
read fresh from disk per request (no cache), written read-merge-write via tmp+rename. Migration is
**copy-then-delete** (no marker flag): slots fill only absent auth fields, then get deleted, so launch
2 is naturally a no-op. The config seed reads settings via `inspect().globalValue` (user scope ONLY) —
a workspace value could redirect the bearer key once the machine-scope registrations were deleted.
`maxTokens`/`temperature` deliberately STAY VS Code settings (editor-local tuning, not shared state —
the TUI gets its own knobs if ever needed). Unknown JSON keys survive parse/serialize so a TUI-era
field is never dropped by an extension write. OAuth managers re-read auth.json before refreshing and
persist a successful rotation OUTSIDE the fetch catch (a failed write must not discard a consumed
refresh token).
**Why:** ADR-0002 set the destination; these are the safety rails found while executing it (the
workspace-seed hole was caught in review — scope enforcement only applies to registered settings).
**Reversibility:** file layout easy to extend, hard to rename once the TUI ships (#60 reads it);
the user-scope-only seed rule is one-way (security).

## Related

- [[decisions]] — index
