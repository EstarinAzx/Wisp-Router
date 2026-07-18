---
type: active-work
project: wisp
updated: 2026-07-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-18 by Claude (local session — v2.0.17 shipped)._
_At commit: `971cefd` on `main` (pushed, tagged `v2.0.17`, released, binary installed)._

## Current focus

**Nothing in flight — clean slate.** Third ship cycle of 2026-07-18: **thinking
passthrough as v2.0.17** — the last fidelity gap. `thinking`/`redacted_thinking`
blocks now round-trip client ↔ Anthropic (raw-sidecar verbatim replay outbound,
live thinking SSE frames inbound), and Claude 5 models (fable-5/sonnet-5) joined
the effort-capable set — previously /effort was silently dropped on the DEFAULT
model. Grilled first per the held-task agreement (7 locked decisions), built
TDD, review found 2 real bugs (fixed), live-probed extensively against the real
OAuth endpoint. Anthropic-OAuth path now believed at FULL quota + fidelity
parity with native Claude Code.

## State

- **In flight:** None.
- **Done this session (v2.0.17 cycle):**
  - Grill: 7 decisions locked (stateless passthrough, raw sidecar, event
    vocabulary extension, Wisp keeps param control, evidence-before-insurance,
    silent drop on non-Anthropic, straight implement). See
    [[2026-07-18-thinking-passthrough-raw-sidecar]].
  - TDD implementation across parse → body builder → stream → encoder →
    buffered reply; OpenAI door + chatProvider guarded against the new event
    kinds.
  - Live probes surfaced two facts folded in same cycle: OAuth endpoint emits
    thinking blocks with EMPTY text + signature (needed explicit
    `thinkingStart` event), and Claude 5 was missing from all three effort
    regexes (accepted through `max`, live-probed both models).
  - cavecrew review: 2 real findings fixed (tool calls now yield at stream
    position so interleaved thinking order survives; sidecar sheds client
    `cache_control` markers to protect the 4-breakpoint budget). 2 findings
    overruled/accepted with evidence (see decision entry).
  - Live-verified: full tool-continuation round trip through the door on
    opus-4-8 AND fable-5; cross-model signature replay tolerated (200);
    thinking-strip tolerated; codex smoke clean.
  - Released v2.0.17: bump, span-baseline recaptured, CHANGELOG, tag,
    release.yml green ×4 runners + publish, `npm i -g wisp-router@2.0.17`.
  - Deleted `claude/thinking-passthrough` (merged fast-forward).
- **Held deliberately (backlog, NOT bugs):**
  - Codex `reasoning` summaries surfaced as thinking blocks out the Anthropic
    door — adjacent feature, own loop to reason through (unsigned blocks
    resent to Codex targets). Grill-first if picked up.
  - Thinking-only turn on the OpenAI door / vscode chatProvider renders a
    silent empty completion (those doors drop thinking; old behavior was a
    loud 502 — both dead ends, accepted ceiling).
  - TUI model-switch cache warning in `routingScreens.tsx` (speculative,
    build only if hit).
- **Blocked:** None.

## Pick up here

See [[pick-up]]. No mandatory next task.

## Open questions

- Does full fidelity hold under real interleaved multi-thinking turns? Probes
  covered single thinking blocks; stream-position tool yields should preserve
  interleave, but a long agentic session on wisped fable is the true test —
  user daily-driving is the verification.
- Elucidate's badge is also purple — unrelated older open question, still open.

## Recent context

- Test suite totals: core vitest **498** (was 481), tui bun test 13.
- The OAuth endpoint is lenient where docs are silent: foreign/model-mismatched
  thinking signatures → 200, stripped thinking on continuation → 200,
  `adaptive` + `output_config.effort` (incl. xhigh/max) on Claude 5 → 200.
  All live-probed 2026-07-18.
- `wisp --version` is not a flag — version reads off the TUI splash.

## Related

- [[overview]]
- [[pick-up]]
- [[stack]]
- [[decisions]]
- [[gotchas]]
- [[2026-07-18-thinking-passthrough-raw-sidecar]]
