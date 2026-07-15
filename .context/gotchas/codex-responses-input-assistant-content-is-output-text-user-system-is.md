---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex Responses input: assistant content is `output_text`, user/system is `input_text`

A replayed **assistant** turn's content part must be typed `output_text`; user/system stay `input_text`. The
Responses API rejects the wrong type. `buildCodexResponsesBody` picks per role. Images (`input_image`) ride
only on non-assistant turns (the API rejects `input_image` on assistant items). Mirrors XETH-7's codexShim
`convertContentBlocksToResponsesParts`.

## Related

- [[gotchas]] — index
