---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Model ids are BARE on `zen/go/v1` — the `opencode/` prefix is rejected

The chat endpoint returns `401 Model opencode/minimax-m3 is not supported` for a provider-prefixed id. Use the **bare** id exactly as `GET /models` serves it (`minimax-m3`, `glm-5`, `kimi-k2.6`, …). `DEFAULT_MODEL`, the setting default, and `fetchModelIds` must all stay bare. The `opencode/<id>` form (from the reference `llm-provider` and the public docs) does **not** work against this gateway — it had inline completions silently erroring the whole time. The sibling **`/zen/v1`** (OpenCode Zen, added in #12) also serves **bare** ids (verified 2026-06-18 against its public `GET /zen/v1/models`) — but a **different, premium** model set (Claude/GPT/Gemini), not Go's budget ids. See [[decisions]].

## Related

- [[gotchas]] — index
