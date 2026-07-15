---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# "Model can't see the image" over the Bridge — read `images=N` in the log BEFORE touching code (#51+)

Claude Code sends every attach with its **source path as text** (`[Image: source: C:\...png]`), so a
Codex-tuned model often calls Read on the path even when the inline pixels arrived — that LOOKS like a
vision bug and is model habit. Ground truth is the door's per-request log line suffix **`images=N`**:
`0` ⇒ the client never sent pixels (client-side gating); `>0` ⇒ any blindness is downstream of the door
(builders are pure + unit-tested, so suspect the backend). Also remember BOTH 2026-07-14 fixes: the
Anthropic provider path in `startProviderStream` must keep forwarding `images`, and `splitUserBlocks`
must keep hoisting `tool_result`-embedded images (Read-on-image pixels ride INSIDE tool_result content).
A model "describing" an image it never saw is a real failure mode — dimensions come from Read's text
metadata and the rest is context-plausible bluff; don't accept a description as proof of vision.

## Related

- [[gotchas]] — index
