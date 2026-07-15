---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Panel stays: two full faces over one backend (#66 cancelled)

**Decision:** the extension side panel AND Inquire are permanent — #66 (extension shrink, v2.0.0,
panel + Inquire removed) is **closed/cancelled**. Wisp's product shape is two complete faces over
one shared backend (the `~/.wisp` store + `@wisp/core`), the way a SaaS ships web + mobile apps on
one backend. TUI parity tickets (#61/#63/#65) stay — they complete the TUI face, they no longer
gate a deletion.
**Why:** the shrink's driver was "config surface welded to an editor" back when state lived in
SecretStorage/settings; #59 (ADR-0002) dissolved that — both faces now read/write the same store
and stay live-synced via the watcher. Webview maintenance is an accepted, deliberate cost.
**Reversibility:** easy — the shrink could be revived any time; the reverse (restoring a deleted
panel) was the one-way door, which is exactly why it stays.

## Related

- [[decisions]] — index
