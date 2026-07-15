---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# GitHub runners: macos-13 is a zombie label; opentui select's ▶ is ambiguous-width

Two traps from the same release. **1)** `macos-13` (the last free Intel-mac label) retired
Dec 2025 — a job using it doesn't fail, it **queues forever** (24h timeout) and blocks every
`needs:` job. Intel macs = `macos-15-intel` (free, until Aug 2027). **2)** opentui 0.4.3 hardcodes
the select indicator as `"▶ "` (no glyph option, only `showSelectionIndicator`); U+25B6 is an
ambiguous-width char that renders double-wide on common Windows terminal fonts and smears into the
label. Same family as the border-title non-ASCII drop: **on opentui surfaces, treat non-ASCII as
hostile.** All 8 TUI selects run `showSelectionIndicator={false}` — don't reintroduce it.

## Related

- [[gotchas]] — index
