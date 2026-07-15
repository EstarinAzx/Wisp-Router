---
type: decision
project: wisp
updated: 2026-07-13
tags: [context, decisions]
---

# Gate #44 verdict: picker filters plain ids → `claude-wisp-*` aliases + inbound strip

**Decision:** The Anthropic door's discovery lists **`claude-wisp-<provider>` aliases only** and strips the
prefix inbound — Claude Code's `/model` picker filters non-`claude-*` ids (empirically confirmed: plain
`codex`/`opencode` absent, both aliases shown, `display_name` rendered). Alias arrives verbatim in the POST
body. Companion facts locked for #45 (full record: issue #44's two comments): `system` is a block ARRAY;
`role:"system"` turns appear inside `messages` (mid-conversation-system beta); background tier sends stock
`claude-haiku-4-5-20251001` with **forced `tool_choice`** + `temperature:0` (translator must map both — the
chat path's hardcoded `'auto'` is not enough); `anthropic-beta` varies per call → treat opaque. Bridge auth
widened permanently: secret via `x-api-key` OR `Bearer`.
**Why:** The gate ran real Claude Code (print mode both auth variants + interactive picker session) against
the canned door; plain ids stay usable via `--model`/`ANTHROPIC_MODEL` (sent verbatim, no client-side
validation), so the alias list costs nothing in capability.
**Reversibility:** easy — discovery list shape is one function; the strip is one line inbound.

## Related

- [[decisions]] — index
