---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# Context window is DECOMPOSED into input+output (display correctness)

**Decision:** VS Code's "Context Size" column = `maxInputTokens + maxOutputTokens` (summed). So treat
the source value as the **total** window and split it: `maxOutputTokens = min(output, floor(window/2))`,
`maxInputTokens = window − maxOutputTokens`. The pair sums to the real context; the half-window cap stops
an anomalous `output == context` entry (real: `kimi-k2.7-code`, ctx=out=262144) from zeroing the input.
**Why:** passing `context` as input AND `output` as output inflated every model (kimi showed 524K vs its
real 256K; gpt-4o-mini 144K vs 128K). Verified live: kimi 256K, gpt-4o-mini 128K — matching each
provider's real window (and Ollama's display).
**Reversibility:** easy.

## Related

- [[decisions]] — index
