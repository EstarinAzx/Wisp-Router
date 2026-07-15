---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Ollama Cloud base URL is `/v1`, NOT `/api/v1`

Ollama Cloud (`ollama.com`, the **hosted** service — distinct from local `localhost:11434`) is
OpenAI-compatible at `https://ollama.com/v1`. The `/api` prefix (`/api/chat`, `/api/tags`) is Ollama's
**native** protocol and breaks the OpenAI SDK. Use `/v1` for the catalog row; key env var
`OLLAMA_API_KEY` (Bearer). Local Ollama needs no key. Verified 2026-06-15 (multi-provider research).

## Related

- [[gotchas]] — index
