---
type: gotcha
project: wisp
updated: 2026-07-19
tags: [context, gotchas]
---

# Claude Code Advisor through Wisp — RESOLVED, shipped 2.0.21 (was never endpoint-gated)

**Current truth:** the Advisor **works** through a wisp-launched session as of `wisp-router@2.0.21`.
The door plays the server-tool role; `/advisor` picks the reviewer, routed through the Routing map.
The old amber "endpoint-gated, use native `claude`" warning in `/bridge` + the side panel is **gone**.

**History — two wrong beliefs, both corrected.** This gotcha first said "endpoint-gated upstream,
calls never reach the Bridge, no fix." Investigation 2026-07-19 (openclaude source + real `claude`
2.1.215 binary read) proved otherwise, and the fix shipped:

- A wisp session is **`firstParty`** — the gateway-discovery env (`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`)
  does NOT flip `vn()` to `"gateway"` (that needs `gatewayAuth`, which a plain base-URL+key session lacks).
  So the advisor's master gate `D9()` passes. Not endpoint-gated.
- The Advisor is a **server-executed tool** (`server_tool_use` name `advisor`): the model emits the call
  and waits for the *server* (= the Bridge, through Wisp) to run the reviewer and return `advisor_tool_result`.
  Wisp's door had no advisor handling, so the call dangled — a **missing server role**, now filled.

**One live-side prerequisite you must know:** with a `claude-wisp-*` base model, Claude Code injects the
advisor tool ONLY under `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1` (the alias has no `advisor_rank`
in Claude Code's catalog — the base-model gate `_1e()` fails without the flag, and the model then reports
"advisor tool not there"). The `claude-wisp` launcher and the copy-paste snippets now set this flag, so it
works out of the box; a hand-rolled env setup must set it too.

Full design + source refs + the binary gate chain in [[2026-07-19-wisp-native-advisor-via-door-server-tool]].

## Related

- [[2026-07-19-wisp-native-advisor-via-door-server-tool]] — the shipped design + Stage 0 evidence
- [[gotchas]] — index
