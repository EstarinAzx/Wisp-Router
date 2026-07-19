---
type: gotcha
project: wisp
updated: 2026-07-19
tags: [context, gotcha, bridge, cache, advisor]
---

# buildAnthropicMessagesBody must not mutate caller rawContent

`buildAnthropicMessagesBody` places #111 `cache_control` breakpoints by writing
onto content-block objects. Thinking-passthrough turns carry a `rawContent`
sidecar that is *replayed* into the body. If that replay is the caller's array
by reference, `mark()` stamps markers back into `parsed.turns` — and any later
build from the *same* turns (the advisor flow does base → reviewer →
continuation) inherits those markers and can exceed Anthropic's hard cap of 4
(`"A maximum of 4 blocks with cache_control may be provided. Found 5."`).

**Rule:** always replay a *copy* of `rawContent`, with any inbound
`cache_control` stripped (Anthropic also rejects it on thinking blocks). Never
hand the caller's array to the marker walk. The regression test in
`anthropic.test.ts` ("does not mutate the caller rawContent…") fails if this
comes back.

The advisor reviewer also deliberately *avoids* the raw turns
(`serializeForReview` → one plain-text user message) so its request stays at 2
markers regardless. Don't "simplify" that back to forwarding `parsed.turns`.

## Related

- [[gotchas]]
- [[2026-07-19-advisor-cache-control-mutation-and-reviewer-frame]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]
