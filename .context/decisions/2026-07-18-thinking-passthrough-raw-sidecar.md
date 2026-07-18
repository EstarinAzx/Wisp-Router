---
type: decision
project: wisp
updated: 2026-07-18
tags: [context, decision]
---

# Thinking passthrough: raw sidecar + live probes over insurance code

## Decision

`thinking`/`redacted_thinking` fidelity (v2.0.17) is built as: **stateless
passthrough** (client holds the truth; Wisp stores nothing), a **raw-sidecar
replay** (`NormalizedTurn.rawContent` keeps the original block array of
thinking-bearing assistant turns; the Anthropic body builder emits it verbatim
when thinking is on, normalized-rebuild strip when off), and an **internal
event vocabulary extension** (`thinkingStart`/`thinking`/`thinkingSignature`/
`redactedThinking` through stream → encoder → buffered reply). Wisp keeps
generation-param control (inbound `thinking` param stays ignored; effort policy
decides). Non-Anthropic targets + the OpenAI door drop thinking silently.
Claude 5 (fable-5/sonnet-5) added to all three effort regexes.

Rejected: Wisp-side thinking cache (invents session state in a stateless
bridge); ordered-block refactor of NormalizedTurn (cross-target blast radius
for one target's need); raw SSE tee (bypasses the tested encoder spec);
strip-and-retry on signature 400 (probed unnecessary — see below).

## Why

Byte-for-byte replay incl. signatures + interleaved order can't be rebuilt
from NormalizedTurn's kind-split arrays; the sidecar gets fidelity by
construction with near-zero blast radius. Live probes (2026-07-18, real OAuth
endpoint) replaced speculation: foreign/cross-model signatures → 200,
stripped thinking on continuation → 200, adaptive+effort through `max` on
both Claude 5 models → 200, and the endpoint emits thinking blocks with
EMPTY text + signature (which forced the explicit `thinkingStart` event —
delta-opens-block loses signed empty blocks). Two review findings became
fixes: tool calls yield at stream position (else interleaved order shuffles),
sidecar sheds client `cache_control` (else the 4-breakpoint cap busts).

## Reversibility

High per piece: the sidecar is one optional field read only by the Anthropic
body builder; event kinds are additive to closed unions; regex widening is a
one-line revert per model set. The strip-and-retry skip is revisitable the
day the endpoint starts enforcing signatures (probe scripts remain in the
session scratchpad pattern — cheap to re-run).

## Related

- [[decisions]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[active-work]]
