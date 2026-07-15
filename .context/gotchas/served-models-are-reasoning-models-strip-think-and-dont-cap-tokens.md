---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Served models are reasoning models — strip `<think>` and DON'T cap tokens

Most `zen/go` ids (minimax-m3, mimo, qwen3*, glm5*) emit chain-of-thought **inline** as `<think>…</think>`, then the real answer. Two consequences: (1) `stripThink` (in `src/catalog.ts`, composed into `extractEditText`) must drop the block (and treat an unterminated `<think>` as "no answer yet" → return nothing) or the Inquire edit is the model's thinking; (2) a low `max_tokens` cap starves the answer — the model spends the budget thinking and never reaches code. `maxTokens` default is therefore `0` (uncapped); `max_tokens` is omitted from the request unless set `>0`. For snappy edits use a non-reasoning id (`deepseek-v4-flash`, `kimi-k2.6`). See [[decisions]].

## Related

- [[gotchas]] — index
