---
type: decision
project: wisp
updated: 2026-07-19
tags: [context, decision]
---

# Wisp-native Advisor: the door plays the server-tool role (planned 2.0.21)

**Decision.** Wisp *can* make Claude Code's Advisor work through the Bridge, and will — as a
new capability in the Anthropic door. The old "endpoint-gated, no code fix" gotcha was the
wrong root cause. Real fix: teach the door to **execute the advisor server tool itself** and
hand the result back. Queued as **2.0.21, behind 2.0.20** (`claude/anthropic-cache-ttl-fix`).
Not started — investigation + plan only.

## What the Advisor actually is (openclaude source, 2026-07-19)

Not a normal client-run tool — a **server-executed tool**. The model emits a `server_tool_use`
block named `advisor`; the *API server* runs a stronger reviewer model over the whole
conversation and injects an `advisor_tool_result` back. Claude Code never runs the reviewer.

| Piece | Where (openclaude `Gitlawb/openclaude`) |
|---|---|
| Server-tool block types | `src/utils/advisor.ts:9-34` (`server_tool_use` name `advisor` / `advisor_tool_result`) |
| Result shape | `src/utils/advisor.ts:16-32` — `content:{type:'advisor_result', text}` |
| Instructions injected to model | `src/utils/advisor.ts:134-149` (`ADVISOR_TOOL_INSTRUCTIONS`) |
| First-party gate | `src/utils/advisor.ts:60-69` → `betas.ts:227-233` → `anthropicBaseUrl.ts:1-21` |
| Beta header (1P only) | `src/constants/betas.ts:32` = `advisor-tool-2026-03-01` |
| Tool injected into request body | `src/services/api/claude.ts:1502-1512` — `{type:'advisor_20260301', name:'advisor', model}` |
| Model gate (which base/advisor models) | `src/utils/advisor.ts:89-110` (opus-4-6/7/8, sonnet-4-6) |

_(openclaude is a reimplementation; the **real** Claude Code binary gates the `/advisor`
command more loosely — see evidence below. Live behavior beats source here.)_

## Why it fails today — corrected root cause

**Old belief:** endpoint-gated upstream, calls never reach the Bridge, no fix.
**Actual (evidence, 2026-07-19):**

1. **The native picker works through Wisp.** User screenshot: `/advisor` opens, lists Opus/Sonnet/
   "No advisor", selection sticks. So client config *survives* the Bridge — the client side is
   not the blocker.
2. **Wisp has zero advisor handling.** `bridgeAnthropic.ts` parses only `text` / `tool_use` /
   `tool_result`. A `server_tool_use` (advisor) block in assistant history is skipped
   (`:146-168`, no branch); an `advisor_tool_result` in a user turn is skipped
   (`splitUserBlocks :94-122`); the advisor tool in `body.tools` loses its `type` and is
   forwarded as a **schema-less regular tool** (`:175-179`).
3. So when the model calls advisor, Claude Code waits for *the server* (= Wisp) to run the
   reviewer and return `advisor_tool_result`. **Wisp doesn't know it's supposed to → the call
   dangles.** That is the whole bug. Not upstream gating — a missing server role in the door.

## The plan (stages, cheapest+riskiest first)

**Stage 0 — Confirm Flavor A vs B (throwaway, NOT part of the release).**
Temp-log the Anthropic door: dump the request body when it carries an `advisor_20260301` tool,
and log what Claude Code does with a returned result block. One `claude-wisp` session with
advisor on. Answers:
- (a) does the `advisor_20260301` tool actually cross the wire to the door?
- (b) does Claude Code render an `advisor_tool_result` we emit?
Both yes → **Flavor A** (revive the native `/advisor`). Else → **Flavor B** (Wisp-injected
look-alike tool + `ADVISOR_TOOL_INSTRUCTIONS`). Same engine, different last stage.

**Stage 1 — Door sees the advisor.** `bridgeAnthropic.ts`: detect the `advisor_20260301` tool,
extract its model, keep it out of the forwarded regular-tools list; parse `server_tool_use` /
`advisor_tool_result` history blocks instead of dropping them.

**Stage 2 — Door executes the advisor (the new capability).** On the advisor call, take the
normalized conversation and make a **separate backend call** to the chosen advisor Target via
the existing client path; get advice text. This bridge-originated sub-call is the genuinely new
architecture — the door is a pure translator today.

**Stage 3 — Hand advice back.** Extend `createAnthropicSseEncoder` + `buildAnthropicMessageResponse`
to emit `server_tool_use` + `advisor_tool_result` in the exact shape Claude Code expects, so its
native Advisor UI renders. Add matching `BridgeStreamEvent` variants alongside text/thinking/tool.

**Stage 4 — Model choice.** Honor the model Claude Code's picker sends, mapped through Wisp
routing; optional Wisp-side override so any Target (Opus/Codex/Grok) can be the advisor.

**Stage 5 — Fallback.** Only if Stage 0 = B: surface as Wisp's own injected tool. Same Stage-2
engine.

## Release framing

- **2.0.21, behind 2.0.20.** Different code area from the cache-ttl fix (door tool handling vs
  cache breakpoints) → rebases clean on top, no collision. `wisp-router` line (vscode ext 1.7.0
  stays put). Bump `packages/tui/package.json` → span-baseline `--update` → tui CHANGELOG → tag
  `v2.0.21`.
- Could be 2.1.0 if treated as a headline feature — user's call; .21 matches the feat-as-patch
  pattern (2.0.18/2.0.19).

## Guardrails

- Parse/encode is pure core → unit tests in `bridgeAnthropic.test.ts` before ship.
- Live-verify with isolated `WISP_HOME` on spare port 41185, never touch live 41184
  (see [[live-verify-the-bridge-from-source-isolated-wisp-home-on-a-spare-port]]).
- Do **not** remove the cache breakpoints (#111) while in the door
  ([[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]).

## Related

- [[claude-code-advisor-is-endpoint-gated-past-the-bridge]] — the gotcha this supersedes
- [[2026-07-18-openclaude-cache-control-steal-list]] — prior openclaude-vs-Wisp comparison
- [[active-work]] · [[decisions]]
