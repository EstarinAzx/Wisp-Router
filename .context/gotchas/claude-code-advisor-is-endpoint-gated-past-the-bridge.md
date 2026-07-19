---
type: gotcha
project: wisp
updated: 2026-07-19
tags: [context, gotchas]
---

# Claude Code Advisor doesn't work through Wisp — root cause corrected (fix planned 2.0.21)

**Current user-facing truth:** the Advisor still doesn't work through a wisp-launched session,
so **use native `claude` for advisor tasks** for now. `/bridge` shows an amber warning to this
effect since `wisp-router@2.0.9` (hand-wrapped row, no ⚠ glyph — ambiguous-width, smears on
common Windows fonts).

**But the old reason was wrong.** This gotcha originally said "endpoint-gated upstream, its
calls never reach the Bridge, no code fix." Investigation 2026-07-19 (openclaude source read +
user screenshot of a live wisped session) shows otherwise:

- The **native `/advisor` picker works through Wisp** — it opens, lists models, selection
  sticks. Client config survives the Bridge; the client is not the blocker.
- The Advisor is a **server-executed tool** (`server_tool_use` name `advisor`). Claude Code
  emits the call and waits for *the server* — which through Wisp is the Bridge — to run the
  reviewer and return `advisor_tool_result`.
- **Wisp's door has no advisor handling** (`bridgeAnthropic.ts` knows only text/tool_use/
  tool_result). So the call dangles. The failure is a **missing server role in the door**, not
  upstream gating.

That makes it **fixable on Wisp's side**: the door executes the advisor itself. Full plan +
source refs in [[2026-07-19-wisp-native-advisor-via-door-server-tool]] (Stage 0 test confirms
whether the native `/advisor` can be revived, or only a Wisp look-alike). Queued 2.0.21.

## Related

- [[2026-07-19-wisp-native-advisor-via-door-server-tool]] — the fix plan
- [[gotchas]] — index
