---
type: decision
project: wisp
updated: 2026-07-13
tags: [context, decisions]
---

# The door honors Claude Code's /effort (reverses the "panel effort only" deferral)

**Decision:** The Anthropic door reads **`output_config.effort`** (where Claude Code's `/effort` rides) and,
when it's a valid ladder value, it **overrides the Wisp panel effort** for the door's Codex + Anthropic sends
(`max` still folds to `xhigh` on Codex's wire). Absent/junk → panel effort, exactly the old behavior. A log
line per door call names which effort won (`[bridge] messages <provider> effort=<level> (claude code|panel)`).
Companion fix: `buildChatModelInfos` appends the "· <effort>" picker-label suffix **only when the caller
threads an effort** — the in-VS-Code Copilot picker does (live panel value), the Bridge doors don't (their
effort is per-request now, so a static label would pin DEFAULT_EFFORT forever — both doors' discovery lists
showed a frozen "· medium" regardless of the real level).
**Why:** User-directed — wanted gpt models driven at Claude Code's chosen depth. Verified live: `/effort`
xhigh/high/max each arrived at the door (`effort=max (claude code)` in the Wisp channel). The remaining
carried-but-not-threaded extras (forced `tool_choice`, `temperature`) stay deferred. Claude Code's own banner
effort badge doesn't repaint after `/effort` — hardcoded upstream UI, no knob; not ours.
**Reversibility:** easy (drop the `parsed.effort ??` override) — but don't: the deferral was explicitly
reversed on request, and the suffix-only-when-threaded rule keeps discovery labels honest.

## Related

- [[decisions]] — index
